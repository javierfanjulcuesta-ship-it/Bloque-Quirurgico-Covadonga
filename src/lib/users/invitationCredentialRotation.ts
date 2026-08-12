import type { PrismaClient } from "@prisma/client";

type CredentialClient = Pick<PrismaClient, "user">;

/**
 * Claims a password rotation only if the credential still matches the hash read by
 * the caller. This makes concurrent invitation attempts mutually exclusive without
 * keeping a database transaction open while an external email provider is called.
 */
export async function claimInvitationCredential(
  client: CredentialClient,
  userId: string,
  expectedPasswordHash: string,
  nextPasswordHash: string,
): Promise<boolean> {
  const result = await client.user.updateMany({
    where: {
      id: userId,
      passwordHash: expectedPasswordHash,
      deletedAt: null,
    },
    data: { passwordHash: nextPasswordHash },
  });
  return result.count === 1;
}

/**
 * Restores a prior hash only when the credential is still the one installed by the
 * failed invitation attempt. A newer password can therefore never be overwritten
 * by a late rollback from an older request.
 */
export async function rollbackInvitationCredential(
  client: CredentialClient,
  userId: string,
  failedAttemptPasswordHash: string,
  previousPasswordHash: string,
): Promise<boolean> {
  const result = await client.user.updateMany({
    where: {
      id: userId,
      passwordHash: failedAttemptPasswordHash,
    },
    data: { passwordHash: previousPasswordHash },
  });
  return result.count === 1;
}
