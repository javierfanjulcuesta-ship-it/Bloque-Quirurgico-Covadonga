import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { parseMasterWorkbook, planMasterImport } from "@/lib/intake/masterWorkbook";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const limited = await readTextBodyWithLimit(request, MAX_BODY);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const raw = body as { fileName?: unknown; contentBase64?: unknown };
  const fileName = typeof raw.fileName === "string" && raw.fileName.trim() ? raw.fileName.trim().slice(0, 180) : "maestro.xlsx";
  if (typeof raw.contentBase64 !== "string" || raw.contentBase64.length === 0) {
    return NextResponse.json({ error: "Falta el Excel" }, { status: 400 });
  }
  const bytes = Buffer.from(raw.contentBase64, "base64");
  const parsed = parseMasterWorkbook(bytes);
  if (!parsed.ok) {
    const message = parsed.error === "dni_column"
      ? "El Excel trae una columna DNI, NIE o NIF. No se ha importado nada."
      : parsed.error === "missing_sheets"
        ? "El Excel no tiene las hojas 1_PROGRAMA o DATOS_IQ."
        : "Las hojas maestras no traen filas utilizables.";
    return NextResponse.json({ error: message, code: parsed.error }, { status: 422 });
  }

  const dates = [...new Set(parsed.rows.map((row) => row.serviceDate))];
  const [existing, identities] = await Promise.all([
    prisma.intakeRow.findMany({
      where: { serviceDate: { in: dates } },
      select: { dedupKey: true, historyNumber: true, patientName: true, serviceDate: true },
    }),
    prisma.patientIdentity.findMany({ select: { historyNumber: true, displayName: true } }),
  ]);
  const plan = planMasterImport({ existing, identities, incoming: parsed.rows });
  const batch = await prisma.intakeBatch.create({
    data: {
      fileName,
      sheetNames: "1_PROGRAMA,DATOS_IQ",
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      status: plan.batchStatus,
      rowCount: parsed.rows.length,
      missingKeysJson: plan.missingKeys.length > 0 ? JSON.stringify(plan.missingKeys) : null,
      createdByUserId: session!.userId,
      rows: {
        create: plan.rowsToInsert.map((row) => ({
          dedupKey: row.dedupKey,
          historyNumber: row.historyNumber,
          patientName: row.patientName,
          procedure: row.procedure,
          serviceDate: row.serviceDate,
          shift: row.shift,
          resourceId: row.resourceId,
          slotIndex: row.slotIndex,
          surgeonName: row.surgeonName,
          minutes: row.minutes,
          status: row.status,
          flags: row.flags.join(","),
          suggestedShift: row.suggestedShift,
          suggestedResourceId: row.suggestedResourceId,
        })),
      },
    },
    select: { id: true, status: true, rowCount: true },
  });
  if (plan.identityCreates.length > 0) {
    await prisma.patientIdentity.createMany({
      data: plan.identityCreates.map((identity) => ({
        historyNumber: identity.historyNumber,
        displayName: identity.displayName,
      })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({
    id: batch.id,
    status: batch.status,
    parsedRows: batch.rowCount,
    insertedRows: plan.rowsToInsert.length,
    missingKeys: plan.missingKeys,
  }, { status: 201 });
}
