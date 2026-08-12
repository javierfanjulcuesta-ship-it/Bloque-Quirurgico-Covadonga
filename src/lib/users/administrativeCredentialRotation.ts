import type { PrismaClient } from "@prisma/client";

export type AdministrativeCredentialRotationResult =
  | { ok: true }
  | { ok: false; code: "STALE_CREDENTIAL" };

/**
 * Installs an administratively generated credential only if the hash read by the
 * request is still current. Update and audit commit atomically, preventing two
 * concurrent regenerate-password responses from both claiming success while only
 * one password can actually remain valid.
 */
export async function rotateAdministrativeCredential(
  db: PrismaClient,
  params: {
    userId: string;
    expectedPasswordHash: string;
    nextPasswordHash: string;
    actorUserId: string;
  },
): Promise<AdministrativeCredentialRotationResult> {
  return db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: params.userId,
        passwordHash: params.expectedPasswordHash,
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
        eventType: "USER_PASSWORD_REGENERATED",
        actorUserId: params.actorUserId,
        detailsJson: JSON.stringify({ temporaryCredentialIssued: true }),
      },
    });

    return { ok: true } as const;
  });
}
