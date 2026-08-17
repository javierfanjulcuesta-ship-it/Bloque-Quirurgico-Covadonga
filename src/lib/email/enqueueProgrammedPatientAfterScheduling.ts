import type { Prisma } from "@prisma/client";
import { RESOURCES } from "@/lib/constants";
import { getSlots } from "@/lib/utils";
import { buildProgrammedPatientNotificationEmail } from "./programmedPatientNotificationEmail";
import { enqueueProgrammedPatientNotification } from "./programmedPatientNotificationOutbox";

export interface EnqueueProgrammedPatientsAfterSchedulingParams {
  reservationId: string;
  patientIds: string[];
  recipientEmail: string | null;
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
  surgeonId: string;
}

export function formatPreanesthesiaAppointmentMadrid(value: Date | null): string | null {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

/**
 * Runs inside the scheduling transaction, after phase-2 preanesthesia assignment.
 * It only writes to the durable outbox; it never calls an external email provider.
 */
export async function enqueueProgrammedPatientsAfterScheduling(
  tx: Prisma.TransactionClient,
  params: EnqueueProgrammedPatientsAfterSchedulingParams,
): Promise<void> {
  const recipientEmail = params.recipientEmail?.trim().toLowerCase() ?? "";
  if (!recipientEmail || params.patientIds.length === 0) return;

  const slot = getSlots(params.shift)[params.slotIndex];
  if (!slot) throw new Error("Tramo horario no válido al preparar notificación de paciente programado");

  const [responsible, patients] = await Promise.all([
    tx.user.findUnique({ where: { id: params.surgeonId }, select: { name: true } }),
    tx.patientInBlock.findMany({
      where: { id: { in: params.patientIds }, reservationId: params.reservationId },
      select: {
        id: true,
        historyNumber: true,
        fullName: true,
        procedure: true,
        estimatedDurationMinutes: true,
        anesthesiaType: true,
        insuranceType: true,
        admissionType: true,
        solicitudRecursos: true,
        notes: true,
        patientEmail: true,
        patientPhone: true,
        preanesthesiaStatus: true,
        preanesthesiaAppointmentAt: true,
      },
      orderBy: { orderIndex: "asc" },
    }),
  ]);

  const resourceLabel = RESOURCES.find((resource) => resource.id === params.resourceId)?.label ?? "No consta";
  const responsibleProfessionalName = responsible?.name?.trim() || "No consta";
  const shiftLabel = params.shift === "morning" ? "Mañana" : "Tarde";

  for (const patient of patients) {
    const email = buildProgrammedPatientNotificationEmail({
      patient: {
        fullName: patient.fullName,
        historyNumber: patient.historyNumber,
        procedure: patient.procedure,
        estimatedDurationMinutes: patient.estimatedDurationMinutes,
        anesthesiaType: patient.anesthesiaType,
        insuranceType: patient.insuranceType,
        admissionType: patient.admissionType,
        solicitudRecursos: patient.solicitudRecursos,
        notes: patient.notes,
        patientEmail: patient.patientEmail,
        patientPhone: patient.patientPhone,
      },
      surgery: {
        date: params.date,
        startTime: slot.start,
        endTime: slot.end,
        resourceLabel,
        shiftLabel,
        responsibleProfessionalName,
      },
      preanesthesia: {
        status: patient.preanesthesiaStatus,
        appointmentLabel: formatPreanesthesiaAppointmentMadrid(patient.preanesthesiaAppointmentAt),
      },
    });

    await enqueueProgrammedPatientNotification(tx, {
      reservationId: params.reservationId,
      patientId: patient.id,
      recipientEmail,
      email,
    });
  }
}
