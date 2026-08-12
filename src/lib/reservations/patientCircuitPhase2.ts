/**
 * Fase 2: autocita preanestesia (electivos) y urgencia diferida.
 * Solo dry-run de correos, sin envío real.
 *
 * La asignación electiva se serializa en PostgreSQL mediante un advisory lock
 * transaccional global. Así dos peticiones concurrentes no pueden elegir el
 * mismo hueco a partir de la misma fotografía de ocupación.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  writeReservationEvent,
  type ReservationEventOrigin,
} from "@/lib/reservations/logReservationEvent";
import {
  ADMIN_NOTIFICATION_EMAIL_RULE_KEY,
  DEFAULT_FINANCING_STATUS,
  DEFAULT_PREANESTHESIA_STATUS,
  DEFAULT_WORKFLOW_STATUS,
} from "@/lib/reservations/surgicalCircuitConstants";
import { getAdminNotificationEmail } from "@/lib/reservations/surgicalPatientCircuit";
import {
  findFirstPreanesthesiaSlotUtc,
  loadPreanesthesiaOccupiedKeys,
  todayYmdMadrid,
} from "@/lib/reservations/preanesthesiaAutoAssign";

export const WORKFLOW_MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED";
export const PREANESTHESIA_SCHEDULED = "SCHEDULED";
const PREANESTHESIA_ASSIGNMENT_LOCK_KEY = "qxflow:preanesthesia:autoassign:v1";

export interface Phase2PatientInput {
  patientId: string;
  isDeferredUrgency: boolean;
  specialCircuitReason: string | null;
  patientEmail: string | null | undefined;
  patientPhone: string | null | undefined;
}

export interface ApplyPatientCircuitPhase2Params {
  reservationId: string;
  surgeryYmd: string;
  actorUserId: string;
  origin: ReservationEventOrigin;
  patients: Phase2PatientInput[];
  /** Solo para tests deterministas; en producción se usa Europe/Madrid actual. */
  todayYmd?: string;
}

type ElectiveAssignmentResult =
  | { kind: "scheduled"; atUtc: Date; alreadyScheduled: boolean }
  | { kind: "no_slot" };

async function acquirePreanesthesiaAssignmentLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<Array<{ acquired: number }>>`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtext(${PREANESTHESIA_ASSIGNMENT_LOCK_KEY}))
  `;
}

/**
 * Elige y persiste el hueco usando la transacción del llamador. El advisory lock
 * de preanestesia queda retenido hasta el COMMIT/ROLLBACK de esa misma transacción.
 */
async function assignElectivePatientInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    patientId: string;
    surgeryYmd: string;
    todayYmd: string;
  },
): Promise<ElectiveAssignmentResult> {
  await acquirePreanesthesiaAssignmentLock(tx);

  const current = await tx.patientInBlock.findUnique({
    where: { id: params.patientId },
    select: { preanesthesiaStatus: true, preanesthesiaAppointmentAt: true },
  });
  if (!current) throw new Error("Paciente no encontrado al asignar preanestesia");

  if (current.preanesthesiaStatus === PREANESTHESIA_SCHEDULED && current.preanesthesiaAppointmentAt) {
    return {
      kind: "scheduled",
      atUtc: current.preanesthesiaAppointmentAt,
      alreadyScheduled: true,
    };
  }

  // La ocupación se carga DESPUÉS de adquirir el lock.
  const occupied = await loadPreanesthesiaOccupiedKeys(tx);
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: params.surgeryYmd,
    todayYmd: params.todayYmd,
    occupiedKeys: occupied,
  });

  if (!slot) {
    await tx.patientInBlock.update({
      where: { id: params.patientId },
      data: {
        workflowStatus: DEFAULT_WORKFLOW_STATUS,
        isDeferredUrgency: false,
        specialCircuitReason: null,
        preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
        preanesthesiaAppointmentAt: null,
      },
    });
    return { kind: "no_slot" };
  }

  await tx.patientInBlock.update({
    where: { id: params.patientId },
    data: {
      preanesthesiaAppointmentAt: slot.atUtc,
      preanesthesiaStatus: PREANESTHESIA_SCHEDULED,
      workflowStatus: DEFAULT_WORKFLOW_STATUS,
      isDeferredUrgency: false,
      specialCircuitReason: null,
    },
  });

  return { kind: "scheduled", atUtc: slot.atUtc, alreadyScheduled: false };
}

async function writeAdminDryRun(
  tx: Prisma.TransactionClient,
  adminEmail: string | null,
  params: {
    reservationId: string;
    patientId: string;
    actorUserId: string;
    origin: ReservationEventOrigin;
    base: Record<string, unknown>;
    purpose: string;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  if (adminEmail) {
    await writeReservationEvent(tx, {
      eventType: "ADMIN_NOTIFICATION_DRY_RUN_CREATED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: {
        ...params.base,
        channel: "email",
        wouldSendTo: adminEmail,
        purpose: params.purpose,
        ...params.extra,
      },
    });
  } else {
    await writeReservationEvent(tx, {
      eventType: "ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: { ...params.base, ruleKey: ADMIN_NOTIFICATION_EMAIL_RULE_KEY, purpose: params.purpose },
    });
  }
}

/**
 * Variante estricta para flujos que ya están dentro de una transacción de negocio.
 * Estado clínico y eventos se confirman juntos; cualquier fallo de auditoría provoca
 * rollback del estado de fase 2 y, si la transacción engloba el alta del paciente,
 * también del alta principal.
 */
export async function applyAndLogPatientCircuitPhase2InTransaction(
  tx: Prisma.TransactionClient,
  params: ApplyPatientCircuitPhase2Params,
  adminEmail: string | null,
): Promise<void> {
  const todayYmd = params.todayYmd ?? todayYmdMadrid();

  for (const p of params.patients) {
    const base = {
      dryRun: true,
      patientId: p.patientId,
      patientEmail: p.patientEmail ?? null,
      patientPhone: p.patientPhone ?? null,
    };

    if (p.isDeferredUrgency) {
      await tx.patientInBlock.update({
        where: { id: p.patientId },
        data: {
          workflowStatus: WORKFLOW_MANUAL_REVIEW_REQUIRED,
          isDeferredUrgency: true,
          specialCircuitReason: p.specialCircuitReason?.trim() || null,
          preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
          preanesthesiaAppointmentAt: null,
          financingStatus: DEFAULT_FINANCING_STATUS,
        },
      });

      await writeReservationEvent(tx, {
        eventType: "PATIENT_WORKFLOW_STARTED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: { ...base, workflowStatus: WORKFLOW_MANUAL_REVIEW_REQUIRED, preanesthesiaStatus: "PENDING" },
      });
      await writeReservationEvent(tx, {
        eventType: "DEFERRED_URGENCY_CREATED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: {
          ...base,
          specialCircuitReason: p.specialCircuitReason?.trim() || null,
        },
      });
      await writeAdminDryRun(tx, adminEmail, {
        reservationId: params.reservationId,
        patientId: p.patientId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        base,
        purpose: "deferred_urgency_gestor_review",
        extra: { specialCircuitReason: p.specialCircuitReason?.trim() || null },
      });
      continue;
    }

    const assignment = await assignElectivePatientInTransaction(tx, {
      patientId: p.patientId,
      surgeryYmd: params.surgeryYmd,
      todayYmd,
    });

    if (assignment.kind === "no_slot") {
      await writeReservationEvent(tx, {
        eventType: "PATIENT_WORKFLOW_STARTED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: { ...base, workflowStatus: DEFAULT_WORKFLOW_STATUS, preanesthesiaStatus: "PENDING" },
      });
      await writeReservationEvent(tx, {
        eventType: "PREANESTHESIA_NO_SLOT_AVAILABLE",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: {
          ...base,
          reason: "no_mon_thu_slot_before_surgery_deadline_or_capacity",
          surgeryYmd: params.surgeryYmd,
        },
      });
      continue;
    }

    const preanesthesiaAtIso = assignment.atUtc.toISOString();

    await writeReservationEvent(tx, {
      eventType: "PATIENT_WORKFLOW_STARTED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: {
        ...base,
        workflowStatus: DEFAULT_WORKFLOW_STATUS,
        alreadyScheduled: assignment.alreadyScheduled,
      },
    });
    await writeReservationEvent(tx, {
      eventType: "PREANESTHESIA_APPOINTMENT_ASSIGNED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: {
        ...base,
        preanesthesiaStatus: PREANESTHESIA_SCHEDULED,
        preanesthesiaAppointmentAt: preanesthesiaAtIso,
        alreadyScheduled: assignment.alreadyScheduled,
      },
    });
    await writeReservationEvent(tx, {
      eventType: "PATIENT_NOTIFICATION_DRY_RUN_CREATED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: {
        ...base,
        channel: "email",
        wouldSendTo: p.patientEmail?.trim() || null,
        context: "preanesthesia_appointment",
        preanesthesiaAppointmentAt: preanesthesiaAtIso,
      },
    });
    await writeAdminDryRun(tx, adminEmail, {
      reservationId: params.reservationId,
      patientId: p.patientId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      base,
      purpose: "financing_authorization_with_preanesthesia",
      extra: { preanesthesiaAppointmentAt: preanesthesiaAtIso },
    });
  }
}

/**
 * API autónoma para consumidores que no tengan ya una transacción abierta.
 * La fase 2 completa (estado + auditoría) se ejecuta de forma atómica.
 */
export async function applyAndLogPatientCircuitPhase2(
  prisma: PrismaClient,
  params: ApplyPatientCircuitPhase2Params,
): Promise<void> {
  const adminEmail = await getAdminNotificationEmail();
  await prisma.$transaction(
    async (tx) => {
      await applyAndLogPatientCircuitPhase2InTransaction(tx, params, adminEmail);
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}
