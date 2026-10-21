import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { recognizeResourceId } from "@/lib/program/recognizeResource";
import { QUIROFANO_INFERIDO, TURNO_INFERIDO } from "@/lib/surgeons/habits";

export const dynamic = "force-dynamic";

function withoutFlag(flags: string, flag: string): string {
  return flags.split(",").map((item) => item.trim()).filter((item) => item && item !== flag).join(",");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const { id } = await params;
  const limited = await readTextBodyWithLimit(request, 8 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const raw = body as { shift?: unknown; resourceId?: unknown; slotIndex?: unknown; surgeonName?: unknown };
  const row = await prisma.intakeRow.findUnique({ where: { id } });
  if (!row || row.status === "APPROVED") return NextResponse.json({ error: "La fila no se puede editar" }, { status: 409 });

  const data: { shift?: string; resourceId?: string; slotIndex?: number; surgeonName?: string; flags?: string } = {};
  let flags = row.flags;
  if (raw.shift === "morning" || raw.shift === "afternoon") {
    data.shift = raw.shift;
    flags = withoutFlag(flags, TURNO_INFERIDO);
  }
  if (typeof raw.resourceId === "string" && recognizeResourceId(raw.resourceId)) {
    data.resourceId = raw.resourceId;
    flags = withoutFlag(flags, QUIROFANO_INFERIDO);
  }
  if (typeof raw.slotIndex === "number" && Number.isInteger(raw.slotIndex) && raw.slotIndex >= 0 && raw.slotIndex <= 5) {
    data.slotIndex = raw.slotIndex;
  }
  if (typeof raw.surgeonName === "string" && raw.surgeonName.trim()) data.surgeonName = raw.surgeonName.trim().slice(0, 160);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "No hay cambios válidos" }, { status: 400 });
  data.flags = flags;
  await prisma.intakeRow.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
