import type { PrismaClient } from "@prisma/client";

export type PreanesthesiaAssessmentAction = "NOT_FIT" | "CLEAR_NOT_FIT";

export type PreanesthesiaAssessmentResult =
  | { ok: true; patientId: string; preanesthesiaStatus: string }
  | { ok: false; reason: "patient_not_found" };

/**
 * Persist clinical preanesthesia fitness state and its audit event in one transaction.
 * The patient row is locked before reading the previous status so concurrent assessments
 * are serialized and every audit event describes the state it actually replaced.
 */
export async function setPreanesthesiaAssessment(
  prisma: PrismaClient,
  params: {
    patientId: string;
    actorUserId: string;
    action: PreanesthesiaAssessmentAction;
  },
): Promise<PreanesthesiaAssessmentResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "PatientInBlock"
      WHERE id = ${params.patientId}
      FOR UPDATE
    `;
    if (locked.length === 0) return { ok: false, reason: "patient_not_found" } as const;

    const patient = await tx.patientInBlock.findUnique({
      where: { id: params.patientId },
      select: {
        id: true,
        reservationId: true,
        preanesthesiaStatus: true,
        preanesthesiaAppointmentAt: true,
      },
    });
    if (!patient) return { ok: false, reason: "patient_not_found" } as const;

    const nextStatus = params.action === "NOT_FIT"
      ? "NOT_FIT"
      : patient.preanesthesiaAppointmentAt
        ? "SCHEDULED"
        : "PENDING";

    await tx.patientInBlock.update({
      where: { id: patient.id },
      data: { preanesthesiaStatus: nextStatus },
    });

    await tx.reservationEvent.create({
      data: {
        reservationId: patient.reservationId,
        eventType: "RESERVATION_PATIENT_UPDATED",
        actorUserId: params.actorUserId,
        origin: "app",
        detailsJson: JSON.stringify({
          action: params.action === "NOT_FIT"
            ? "preanesthesia_marked_not_fit"
            : "preanesthesia_not_fit_cleared",
          patientId: patient.id,
          previousPreanesthesiaStatus: patient.preanesthesiaStatus,
          nextPreanesthesiaStatus: nextStatus,
        }),
      },
    });

    return { ok: true, patientId: patient.id, preanesthesiaStatus: nextStatus } as const;
  });
}
