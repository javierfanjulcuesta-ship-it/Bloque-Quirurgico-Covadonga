import type { PrismaClient } from "@prisma/client";
import { claimNextProgrammedPatientNotification, createPrismaProgrammedPatientLeaseStore } from "./programmedPatientNotificationLease";
import {
  processLeasedProgrammedPatientNotification,
  type ProgrammedPatientDelivery,
  type ProgrammedPatientOutboxStore,
  type ProgrammedPatientProcessResult,
} from "./programmedPatientNotificationProcessor";

export interface ProgrammedPatientWorkerResult {
  processed: number;
  sent: number;
  retryScheduled: number;
  exhausted: number;
  invalidPayload: number;
}

export function createPrismaProgrammedPatientProcessorStore(prisma: PrismaClient): ProgrammedPatientOutboxStore {
  return {
    async markSent({ id, sentAt }) {
      await prisma.programmedPatientNotificationOutbox.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt,
          leaseUntil: null,
          lastError: null,
          // Minimise retained patient data once the management notification has been delivered.
          bodyText: null,
        },
      });
    },
    async markFailed({ id, attemptCount, nextAttemptAt, lastError }) {
      await prisma.programmedPatientNotificationOutbox.update({
        where: { id },
        data: {
          status: "FAILED",
          attemptCount,
          nextAttemptAt,
          leaseUntil: null,
          lastError,
        },
      });
    },
  };
}

function countOutcome(result: ProgrammedPatientProcessResult, totals: ProgrammedPatientWorkerResult) {
  totals.processed += 1;
  if (result.outcome === "sent") totals.sent += 1;
  if (result.outcome === "retry_scheduled") totals.retryScheduled += 1;
  if (result.outcome === "exhausted") totals.exhausted += 1;
  if (result.outcome === "invalid_payload") totals.invalidPayload += 1;
}

/**
 * Processes a bounded batch from the durable outbox. The scheduling transaction only
 * enqueues messages; external email delivery happens here after persistence succeeds.
 */
export async function runProgrammedPatientNotificationWorker(params: {
  prisma: PrismaClient;
  deliver: ProgrammedPatientDelivery;
  maxMessages?: number;
  now?: () => Date;
}): Promise<ProgrammedPatientWorkerResult> {
  const maxMessages = Math.max(1, Math.min(50, Math.floor(params.maxMessages ?? 10)));
  const leaseStore = createPrismaProgrammedPatientLeaseStore(params.prisma);
  const processorStore = createPrismaProgrammedPatientProcessorStore(params.prisma);
  const totals: ProgrammedPatientWorkerResult = {
    processed: 0,
    sent: 0,
    retryScheduled: 0,
    exhausted: 0,
    invalidPayload: 0,
  };

  for (let index = 0; index < maxMessages; index += 1) {
    const now = params.now?.() ?? new Date();
    const message = await claimNextProgrammedPatientNotification({ store: leaseStore, now });
    if (!message) break;
    const result = await processLeasedProgrammedPatientNotification({
      message,
      store: processorStore,
      deliver: params.deliver,
      now,
    });
    countOutcome(result, totals);
  }

  return totals;
}
