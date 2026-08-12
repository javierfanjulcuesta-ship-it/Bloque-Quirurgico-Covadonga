import type { PrismaClient } from "@prisma/client";

export interface ReplaceAnesthetistUnavailabilityInput {
  anesthetistId: string;
  actorUserId: string;
  date: string;
  morning: boolean;
  afternoon: boolean;
  reason: string | null;
}

export async function replaceAnesthetistUnavailability(
  db: PrismaClient,
  input: ReplaceAnesthetistUnavailabilityInput,
): Promise<void> {
  await db.$transaction(
    async (tx) => {
      const lockKey = `qxflow:anesthetist-unavailability:${input.anesthetistId}:${input.date}`;
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired
        FROM pg_advisory_xact_lock(hashtext(${lockKey}))
      `;

      const desired = new Set<"MORNING" | "AFTERNOON">();
      if (input.morning) desired.add("MORNING");
      if (input.afternoon) desired.add("AFTERNOON");

      for (const shift of ["MORNING", "AFTERNOON"] as const) {
        if (desired.has(shift)) {
          await tx.anesthetistUnavailability.upsert({
            where: {
              anesthetistId_date_shift: {
                anesthetistId: input.anesthetistId,
                date: input.date,
                shift,
              },
            },
            create: {
              anesthetistId: input.anesthetistId,
              date: input.date,
              shift,
              reason: input.reason,
            },
            update: { reason: input.reason },
          });
        } else {
          await tx.anesthetistUnavailability.deleteMany({
            where: {
              anesthetistId: input.anesthetistId,
              date: input.date,
              shift,
            },
          });
        }
      }

      await tx.userAuditEvent.create({
        data: {
          userId: input.anesthetistId,
          actorUserId: input.actorUserId,
          eventType: "ANESTHETIST_UNAVAILABILITY_UPDATED",
          detailsJson: JSON.stringify({
            date: input.date,
            morning: input.morning,
            afternoon: input.afternoon,
          }),
        },
      });
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}
