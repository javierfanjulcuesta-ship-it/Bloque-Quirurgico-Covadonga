import type { Prisma } from "@prisma/client";
import type { ProgrammedPatientNotificationEmail } from "./programmedPatientNotificationEmail";

export const PROGRAMMED_PATIENT_NOTIFICATION_OUTBOX_VERSION = "v1";
export const PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS = 8;
export const PROGRAMMED_PATIENT_NOTIFICATION_LEASE_MS = 5 * 60 * 1000;

export interface EnqueueProgrammedPatientNotificationParams {
  reservationId: string;
  patientId: string;
  recipientEmail: string;
  email: ProgrammedPatientNotificationEmail;
}

/**
 * Stable business key: one management notification per programmed patient/version.
 * It intentionally uses internal identifiers only inside the database key; those IDs
 * are never rendered into the email body or subject.
 */
export function programmedPatientNotificationIdempotencyKey(
  reservationId: string,
  patientId: string,
): string {
  return `programmed-patient:${PROGRAMMED_PATIENT_NOTIFICATION_OUTBOX_VERSION}:${reservationId}:${patientId}`;
}

/** Exponential retry schedule capped at six hours. */
export function programmedPatientNotificationRetryDelayMs(attemptCount: number): number {
  const normalized = Math.max(1, Math.floor(attemptCount));
  const minutes = Math.min(360, 2 ** Math.min(normalized - 1, 9));
  return minutes * 60 * 1000;
}

export function programmedPatientNotificationNextAttemptAt(
  attemptCount: number,
  now = new Date(),
): Date {
  return new Date(now.getTime() + programmedPatientNotificationRetryDelayMs(attemptCount));
}

/**
 * Persist the outbound message before any external provider call. `upsert` makes
 * repeated scheduling-side invocations idempotent for the same patient.
 */
export async function enqueueProgrammedPatientNotification(
  tx: Prisma.TransactionClient,
  params: EnqueueProgrammedPatientNotificationParams,
): Promise<void> {
  const recipientEmail = params.recipientEmail.trim().toLowerCase();
  if (!recipientEmail) return;

  const idempotencyKey = programmedPatientNotificationIdempotencyKey(
    params.reservationId,
    params.patientId,
  );

  await tx.programmedPatientNotificationOutbox.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      reservationId: params.reservationId,
      patientId: params.patientId,
      recipientEmail,
      subject: params.email.subject,
      bodyText: params.email.text,
      status: "PENDING",
    },
    // Once queued, do not silently replace the content/recipient on a duplicate call.
    // Explicit resend/versioning should be a separate audited action.
    update: {},
  });
}
