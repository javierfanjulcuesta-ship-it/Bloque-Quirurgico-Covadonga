import type { NotificationOutboxStatus, PrismaClient } from "@prisma/client";
import {
  PROGRAMMED_PATIENT_NOTIFICATION_LEASE_MS,
  PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS,
} from "./programmedPatientNotificationOutbox";
import type { ProgrammedPatientOutboxMessage } from "./programmedPatientNotificationProcessor";

export interface ProgrammedPatientLeaseStore {
  findCandidate(now: Date): Promise<{ id: string } | null>;
  tryClaim(params: { id: string; now: Date; leaseUntil: Date }): Promise<boolean>;
  readClaimed(id: string): Promise<ProgrammedPatientOutboxMessage | null>;
}

export function createPrismaProgrammedPatientLeaseStore(
  prisma: PrismaClient,
): ProgrammedPatientLeaseStore {
  const eligibleStatuses: NotificationOutboxStatus[] = ["PENDING", "FAILED"];
  const eligibleWhere = (now: Date) => ({
    status: { in: eligibleStatuses },
    nextAttemptAt: { lte: now },
    attemptCount: { lt: PROGRAMMED_PATIENT_NOTIFICATION_MAX_ATTEMPTS },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
  });

  return {
    async findCandidate(now) {
      return prisma.programmedPatientNotificationOutbox.findFirst({
        where: eligibleWhere(now),
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
    },

    async tryClaim({ id, now, leaseUntil }) {
      const result = await prisma.programmedPatientNotificationOutbox.updateMany({
        where: { id, ...eligibleWhere(now) },
        data: {
          leaseUntil,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
        },
      });
      return result.count === 1;
    },

    async readClaimed(id) {
      const row = await prisma.programmedPatientNotificationOutbox.findUnique({
        where: { id },
        select: {
          id: true,
          recipientEmail: true,
          subject: true,
          bodyText: true,
          attemptCount: true,
        },
      });
      return row;
    },
  };
}

/**
 * Claims at most one due outbox message using an optimistic lease.
 * Two workers may observe the same candidate, but only one can update a still-eligible
 * row because the claim update repeats the lease/status/due predicates against current
 * database state. The loser retries another candidate instead of delivering twice.
 */
export async function claimNextProgrammedPatientNotification(params: {
  store: ProgrammedPatientLeaseStore;
  now?: Date;
  maxCandidateRetries?: number;
}): Promise<ProgrammedPatientOutboxMessage | null> {
  const now = params.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + PROGRAMMED_PATIENT_NOTIFICATION_LEASE_MS);
  const maxCandidateRetries = Math.max(1, Math.min(10, params.maxCandidateRetries ?? 3));

  for (let attempt = 0; attempt < maxCandidateRetries; attempt += 1) {
    const candidate = await params.store.findCandidate(now);
    if (!candidate) return null;

    const claimed = await params.store.tryClaim({ id: candidate.id, now, leaseUntil });
    if (!claimed) continue;

    return params.store.readClaimed(candidate.id);
  }

  return null;
}
