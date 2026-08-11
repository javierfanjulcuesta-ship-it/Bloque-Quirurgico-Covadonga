import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

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

    const outcome = await prisma.$transaction(async (tx) => {
      const patient = await tx.patientInBlock.findUnique({
        where: { id },
        select: {
          id: true,
          reservationId: true,
          preanesthesiaStatus: true,
          preanesthesiaAppointmentAt: true,
        },
      });
      if (!patient) return null;

      const nextStatus = parsed.data.status === "NOT_FIT"
        ? "NOT_FIT"
        : patient.preanesthesiaAppointmentAt
          ? "SCHEDULED"
          : "PENDING";

      await tx.patientInBlock.update({
        where: { id },
        data: { preanesthesiaStatus: nextStatus },
      });

      await tx.reservationEvent.create({
        data: {
          reservationId: patient.reservationId,
          eventType: "RESERVATION_PATIENT_UPDATED",
          actorUserId: session!.userId,
          origin: "app",
          detailsJson: JSON.stringify({
            action: parsed.data.status === "NOT_FIT" ? "preanesthesia_marked_not_fit" : "preanesthesia_not_fit_cleared",
            patientId: patient.id,
            previousPreanesthesiaStatus: patient.preanesthesiaStatus,
            nextPreanesthesiaStatus: nextStatus,
          }),
        },
      });

      return { patientId: patient.id, preanesthesiaStatus: nextStatus };
    });

    if (!outcome) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[preanesthesia patient status PATCH]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
