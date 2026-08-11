import type { PrismaClient } from "@prisma/client";

/** Persist both shifts and append audit in the same transaction. */
export async function setAnesthetistUnavailability(
  prisma: PrismaClient,
  params: {
    anesthetistId: string;
    actorUserId: string;
    date: string;
    morning: boolean;
    afternoon: boolean;
    reason?: string | null;
  },
): Promise<void> {
  const reason = params.reason?.trim() || null;
  await prisma.$transaction(async (tx) => {
    const desired = new Set<"MORNING" | "AFTERNOON">();
    if (params.morning) desired.add("MORNING");
    if (params.afternoon) desired.add("AFTERNOON");

    for (const shift of ["MORNING", "AFTERNOON"] as const) {
      if (desired.has(shift)) {
        await tx.anesthetistUnavailability.upsert({
          where: {
            anesthetistId_date_shift: {
              anesthetistId: params.anesthetistId,
              date: params.date,
              shift,
            },
          },
          create: {
            anesthetistId: params.anesthetistId,
            date: params.date,
            shift,
            reason,
          },
          update: { reason },
        });
      } else {
        await tx.anesthetistUnavailability.deleteMany({
          where: { anesthetistId: params.anesthetistId, date: params.date, shift },
        });
      }
    }

    await tx.userAuditEvent.create({
      data: {
        userId: params.anesthetistId,
        actorUserId: params.actorUserId,
        eventType: "ANESTHETIST_UNAVAILABILITY_UPDATED",
        detailsJson: JSON.stringify({
          date: params.date,
          morning: params.morning,
          afternoon: params.afternoon,
        }),
      },
    });
  });
}
