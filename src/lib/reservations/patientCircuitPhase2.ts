/**
 * Fase 2: autocita preanestesia (electivos) y urgencia diferida. Solo dry-run de correos, sin envío real.
 */

import type { PrismaClient } from "@prisma/client";
import { logReservationEvent, type ReservationEventOrigin } from "@/lib/reservations/logReservationEvent";
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
}

async function logAdminDryRun(params: {
  reservationId: string;
  patientId: string;
  actorUserId: string;
  origin: ReservationEventOrigin;
  base: Record<string, unknown>;
  purpose: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const adminEmail = await getAdminNotificationEmail();
  if (adminEmail) {
    await logReservationEvent({
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
    await logReservationEvent({
      eventType: "ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: { ...params.base, ruleKey: ADMIN_NOTIFICATION_EMAIL_RULE_KEY, purpose: params.purpose },
    });
  }
}

/** Asigna preanestesia / urgencia diferida y registra eventos (tras persistir pacientes). */
export async function applyAndLogPatientCircuitPhase2(
  prisma: PrismaClient,
  params: ApplyPatientCircuitPhase2Params,
): Promise<void> {
  const todayYmd = todayYmdMadrid();
  let occupied = await loadPreanesthesiaOccupiedKeys(prisma);

  for (const p of params.patients) {
    const base = {
      dryRun: true,
      patientId: p.patientId,
      patientEmail: p.patientEmail ?? null,
      patientPhone: p.patientPhone ?? null,
    };

    if (p.isDeferredUrgency) {
      await prisma.patientInBlock.update({
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

      await logReservationEvent({
        eventType: "PATIENT_WORKFLOW_STARTED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: { ...base, workflowStatus: WORKFLOW_MANUAL_REVIEW_REQUIRED, preanesthesiaStatus: "PENDING" },
      });
      await logReservationEvent({
        eventType: "DEFERRED_URGENCY_CREATED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: {
          ...base,
          specialCircuitReason: p.specialCircuitReason?.trim() || null,
        },
      });
      await logAdminDryRun({
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

    const slot = findFirstPreanesthesiaSlotUtc({
      surgeryYmd: params.surgeryYmd,
      todayYmd,
      occupiedKeys: occupied,
    });

    if (!slot) {
      await prisma.patientInBlock.update({
        where: { id: p.patientId },
        data: {
          workflowStatus: DEFAULT_WORKFLOW_STATUS,
          isDeferredUrgency: false,
          specialCircuitReason: null,
          preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
          preanesthesiaAppointmentAt: null,
        },
      });

      await logReservationEvent({
        eventType: "PATIENT_WORKFLOW_STARTED",
        reservationId: params.reservationId,
        actorUserId: params.actorUserId,
        origin: params.origin,
        detailsJson: { ...base, workflowStatus: DEFAULT_WORKFLOW_STATUS, preanesthesiaStatus: "PENDING" },
      });
      await logReservationEvent({
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

    occupied.add(slot.key);
    const preanesthesiaAtIso = slot.atUtc.toISOString();

    await prisma.patientInBlock.update({
      where: { id: p.patientId },
      data: {
        preanesthesiaAppointmentAt: slot.atUtc,
        preanesthesiaStatus: PREANESTHESIA_SCHEDULED,
        workflowStatus: DEFAULT_WORKFLOW_STATUS,
        isDeferredUrgency: false,
        specialCircuitReason: null,
      },
    });

    await logReservationEvent({
      eventType: "PATIENT_WORKFLOW_STARTED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: { ...base, workflowStatus: DEFAULT_WORKFLOW_STATUS },
    });
    await logReservationEvent({
      eventType: "PREANESTHESIA_APPOINTMENT_ASSIGNED",
      reservationId: params.reservationId,
      actorUserId: params.actorUserId,
      origin: params.origin,
      detailsJson: {
        ...base,
        preanesthesiaStatus: PREANESTHESIA_SCHEDULED,
        preanesthesiaAppointmentAt: preanesthesiaAtIso,
      },
    });
    await logReservationEvent({
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
    await logAdminDryRun({
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
