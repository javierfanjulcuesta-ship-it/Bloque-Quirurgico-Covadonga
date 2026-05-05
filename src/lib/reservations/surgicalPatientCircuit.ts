/**
 * Circuito quirúrgico del paciente: estados por defecto, email de notificación externa
 * (no es usuario ni rol de la app) y trazabilidad dry-run. La fase 2 (preanestesia / urgencia diferida)
 * vive en `patientCircuitPhase2.ts`.
 */

import { prisma } from "@/lib/db/prisma";
import { logReservationEvent, type ReservationEventOrigin } from "@/lib/reservations/logReservationEvent";
import {
  ADMIN_NOTIFICATION_EMAIL_RULE_KEY,
  DEFAULT_FINANCING_STATUS,
  DEFAULT_PREANESTHESIA_STATUS,
  DEFAULT_WORKFLOW_STATUS,
} from "@/lib/reservations/surgicalCircuitConstants";

export function defaultPatientCircuitColumns() {
  return {
    workflowStatus: DEFAULT_WORKFLOW_STATUS,
    preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
    financingStatus: DEFAULT_FINANCING_STATUS,
    isDeferredUrgency: false,
    specialCircuitReason: null as string | null,
  };
}

/** Lee el email configurado por el gestor. Vacío o inactivo → null (no bloquea reservas). */
export async function getAdminNotificationEmail(): Promise<string | null> {
  const row = await prisma.programmingRule.findUnique({
    where: { key: ADMIN_NOTIFICATION_EMAIL_RULE_KEY },
    select: { valueJson: true, isActive: true },
  });
  if (!row?.isActive) return null;
  const raw = row.valueJson?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") {
      const e = parsed.trim();
      return e.length > 0 && e.includes("@") ? e.toLowerCase() : null;
    }
  } catch {
    /* valor plano */
  }
  const plain = raw.replace(/^"|"$/g, "").trim();
  return plain.length > 0 && plain.includes("@") ? plain.toLowerCase() : null;
}

export interface LogPatientContactDryRunParams {
  reservationId: string;
  patientId: string;
  actorUserId?: string | null;
  origin?: ReservationEventOrigin | null;
  patientEmail: string | null | undefined;
  patientPhone: string | null | undefined;
}

/** Tras edición de contacto: solo dry-run de notificaciones (no reinicia estados). */
export async function logPatientContactDryRunEvents(params: LogPatientContactDryRunParams): Promise<void> {
  const { reservationId, patientId, actorUserId, origin, patientEmail, patientPhone } = params;
  const adminEmail = await getAdminNotificationEmail();
  const base = { dryRun: true, patientId, patientEmail: patientEmail ?? null, patientPhone: patientPhone ?? null };

  await logReservationEvent({
    eventType: "PATIENT_NOTIFICATION_DRY_RUN_CREATED",
    reservationId,
    actorUserId,
    origin: origin ?? "app",
    detailsJson: { ...base, channel: "email", wouldSendTo: patientEmail?.trim() || null, context: "patient_updated" },
  });
  if (adminEmail) {
    await logReservationEvent({
      eventType: "ADMIN_NOTIFICATION_DRY_RUN_CREATED",
      reservationId,
      actorUserId,
      origin: origin ?? "app",
      detailsJson: {
        ...base,
        channel: "email",
        wouldSendTo: adminEmail,
        purpose: "financing_authorization",
        context: "patient_updated",
      },
    });
  } else {
    await logReservationEvent({
      eventType: "ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL",
      reservationId,
      actorUserId,
      origin: origin ?? "app",
      detailsJson: { ...base, ruleKey: ADMIN_NOTIFICATION_EMAIL_RULE_KEY, context: "patient_updated" },
    });
  }
}
