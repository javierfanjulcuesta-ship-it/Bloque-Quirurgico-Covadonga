import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { parseMasterWorkbook, reviewMasterImport } from "@/lib/intake/masterWorkbook";

export const dynamic = "force-dynamic";

const MAX_BODY = 8 * 1024 * 1024;
const MIN_SALT = 24;

function fingerprintSalt(): string | null {
  const salt = process.env.INTAKE_FINGERPRINT_SALT?.trim() ?? "";
  return salt.length >= MIN_SALT ? salt : null;
}

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
  const raw = body as { contentBase64?: unknown };
  if (typeof raw.contentBase64 !== "string" || raw.contentBase64.length === 0) {
    return NextResponse.json({ error: "Falta el Excel" }, { status: 400 });
  }
  const bytes = Buffer.from(raw.contentBase64, "base64");
  const parsed = parseMasterWorkbook(bytes);
  if (!parsed.ok) {
    const message = parsed.error === "dni_column"
      ? "El Excel trae una columna DNI, NIE o NIF. No se ha guardado nada."
      : parsed.error === "missing_sheets"
        ? "El Excel no tiene las hojas 1_PROGRAMA o DATOS_IQ."
        : "Las hojas maestras no traen filas utilizables.";
    return NextResponse.json({ error: message, code: parsed.error }, { status: 422 });
  }

  const salt = fingerprintSalt();
  const dates = [...new Set(parsed.rows.map((row) => row.serviceDate))];
  const existing = salt
    ? await prisma.intakeFingerprint.findMany({
        where: { serviceDate: { in: dates } },
        select: { serviceDate: true, caseFingerprint: true, historyFingerprint: true, nameFingerprint: true },
      })
    : [];
  const review = reviewMasterImport({ salt: salt ?? "sesion-sin-huella-persistida", existing, incoming: parsed.rows });
  let persisted = false;
  if (salt) {
    const dateMin = dates.slice().sort()[0] ?? null;
    const dateMax = dates.slice().sort().at(-1) ?? null;
    await prisma.intakeBatch.create({
      data: {
        sheetNames: "1_PROGRAMA,DATOS_IQ",
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        status: review.batchStatus,
        rowCount: parsed.rows.length,
        missingCount: review.missingCount,
        dateMin,
        dateMax,
        createdByUserId: session!.userId,
        fingerprints: { create: review.fingerprints },
      },
      select: { id: true },
    });
    persisted = true;
  }

  return NextResponse.json({
    status: review.batchStatus,
    rowCount: parsed.rows.length,
    missingCount: review.missingCount,
    persisted,
    sessionOnly: true,
    rows: review.publicRows,
    parte: review.parte,
    alerts: review.alerts,
  });
}
