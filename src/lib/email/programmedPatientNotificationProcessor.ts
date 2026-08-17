import {
  PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS,
  programmedPatientNotificationNextAttemptAt,
} from "./programmedPatientNotificationOutbox";

export interface ProgrammedPatientOutboxMessage {
  id: string;
  recipientEmail: string;
  subject: string;
  bodyText: string | null;
  attemptCount: number;
}

export interface ProgrammedPatientOutboxStore {
  markSent(params: { id: string; sentAt: Date }): Promise<void>;
  markFailed(params: {
    id: string;
    attemptCount: number;
    nextAttemptAt: Date;
    lastError: string;
  }): Promise<void>;
}

export type ProgrammedPatientDelivery = (params: {
  to: string;
  subject: string;
  textBody: string;
}) => Promise<void>;

export type ProgrammedPatientProcessResult =
  | { outcome: "sent"; attemptCount: number }
  | { outcome: "retry_scheduled"; attemptCount: number; nextAttemptAt: Date }
  | { outcome: "exhausted"; attemptCount: number }
  | { outcome: "invalid_payload"; attemptCount: number };

function safeDeliveryError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Error de entrega no identificado";
  // Never persist provider responses or exception text without a bound. The outbox
  // already contains the intended recipient/body; error diagnostics must stay terse.
  return raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, 500) || "Error de entrega";
}

/**
 * Processes a message that has already been exclusively leased by a worker.
 * Scheduling never calls this function: external delivery is deliberately separated
 * from the clinical transaction that persisted the patient and preanesthesia result.
 */
export async function processLeasedProgrammedPatientNotification(params: {
  message: ProgrammedPatientOutboxMessage;
  store: ProgrammedPatientOutboxStore;
  deliver: ProgrammedPatientDelivery;
  now?: Date;
}): Promise<ProgrammedPatientProcessResult> {
  const now = params.now ?? new Date();
  const attemptCount = Math.max(1, Math.floor(params.message.attemptCount));
  const bodyText = params.message.bodyText?.trim() ?? "";
  const recipientEmail = params.message.recipientEmail.trim();
  const subject = params.message.subject.trim();

  if (!recipientEmail || !subject || !bodyText) {
    await params.store.markFailed({
      id: params.message.id,
      attemptCount: PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS,
      nextAttemptAt: now,
      lastError: "Mensaje incompleto: destinatario, asunto o cuerpo ausente",
    });
    return { outcome: "invalid_payload", attemptCount };
  }

  try {
    await params.deliver({ to: recipientEmail, subject, textBody: bodyText });
    await params.store.markSent({ id: params.message.id, sentAt: now });
    return { outcome: "sent", attemptCount };
  } catch (error) {
    const lastError = safeDeliveryError(error);
    if (attemptCount >= PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS) {
      await params.store.markFailed({
        id: params.message.id,
        attemptCount,
        nextAttemptAt: now,
        lastError,
      });
      return { outcome: "exhausted", attemptCount };
    }

    const nextAttemptAt = programmedPatientNotificationNextAttemptAt(attemptCount, now);
    await params.store.markFailed({
      id: params.message.id,
      attemptCount,
      nextAttemptAt,
      lastError,
    });
    return { outcome: "retry_scheduled", attemptCount, nextAttemptAt };
  }
}
