import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { runImportPlanning, type ImportableBlock } from "@/lib/importPlanning/runImportPlanning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mondayFromIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const denyPerm = requirePermission(session!, "booking:create");
  if (denyPerm) return denyPerm;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const weekStartIso = typeof payload.weekStartIso === "string" ? payload.weekStartIso : "";
  const dryRun = payload.dryRun === true;
  const blocks = Array.isArray(payload.blocks) ? (payload.blocks as ImportableBlock[]) : [];

  const weekStart = mondayFromIso(weekStartIso);
  if (!weekStart) {
    return NextResponse.json({ error: "weekStartIso inválido." }, { status: 400 });
  }
  if (!blocks.length) {
    return NextResponse.json({ error: "No hay bloques válidos para analizar/importar." }, { status: 400 });
  }
  const result = await runImportPlanning({
    weekStart,
    blocks,
    actorUserId: session!.userId,
    dryRun,
  });

  return NextResponse.json({
    ok: true,
    dryRun,
    summary: {
      requested: result.requested,
      ready: result.ready,
      imported: result.imported,
      conflicts: result.conflicts.length,
    },
    imported: result.importedRows,
    conflicts: result.conflicts,
  });
}

