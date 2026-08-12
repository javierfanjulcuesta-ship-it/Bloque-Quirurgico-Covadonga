import type { PrismaClient } from "@prisma/client";

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; code: "STALE_CREDENTIAL" };

/**
 * Replaces a password only if the hash verified by the caller is still current.
 * The compare-and-set and audit event commit atomically, so a concurrent invitation
 * or administrative rotation can never be silently overwritten by a late change.
 */
export async function changePasswordWithAudit(
  db: PrismaClient,
  params: {
    userId: string;
    expectedPasswordHash: string;
    nextPasswordHash: string;
  },
): Promise<PasswordChangeResult> {
  return db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: params.userId,
        passwordHash: params.expectedPasswordHash,
        approved: true,
        deletedAt: null,
      },
      data: { passwordHash: params.nextPasswordHash },
    });

    if (updated.count !== 1) {
      return { ok: false, code: "STALE_CREDENTIAL" } as const;
    }

    await tx.userAuditEvent.create({
      data: {
        userId: params.userId,
        actorUserId: params.userId,
        eventType: "USER_PASSWORD_CHANGED",
        detailsJson: JSON.stringify({ selfService: true }),
      },
    });

    return { ok: true } as const;
  });
}
