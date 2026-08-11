import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { setPreanesthesiaAssessment } from "@/lib/reservations/preanesthesiaAssessment";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["NOT_FIT", "CLEAR_NOT_FIT"]),
});

function canAssess(role: string): boolean {
  const r = role.trim().toLowerCase().replace(/_/g, "-");
  return r === "anestesista" || r === "gestor-anestesista";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const deny = requireAuth(session);
    if (deny) return deny;
    if (!canAssess(session!.role)) {
      return NextResponse.json({ error: "Solo anestesistas pueden registrar la valoración preanestésica" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Paciente requerido" }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Estado inválido" }, { status: 400 });
    }

    const outcome = await setPreanesthesiaAssessment(prisma, {
      patientId: id,
      actorUserId: session!.userId,
      action: parsed.data.status,
    });
    if (!outcome.ok) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    return NextResponse.json({
      patientId: outcome.patientId,
      preanesthesiaStatus: outcome.preanesthesiaStatus,
    });
  } catch (err) {
    console.error("[preanesthesia patient status PATCH]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
