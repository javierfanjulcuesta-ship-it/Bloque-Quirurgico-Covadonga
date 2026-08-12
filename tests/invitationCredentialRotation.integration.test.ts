import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  claimInvitationCredential,
  rollbackInvitationCredential,
} from "../src/lib/users/invitationCredentialRotation";

const prisma = new PrismaClient();
const USER_ID = "invitation-credential-race-user";
const EMAIL = "invitation-credential-race@test.invalid";
const ORIGINAL_HASH = "original-hash";

async function resetUser(): Promise<void> {
  await prisma.userAuditEvent.deleteMany({
    where: { OR: [{ userId: USER_ID }, { actorUserId: USER_ID }] },
  });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: EMAIL,
      passwordHash: ORIGINAL_HASH,
      name: "Usuario carrera invitación",
      role: "CIRUJANO",
      approved: true,
    },
  });
}

beforeEach(async () => {
  await resetUser();
});

after(async () => {
  await prisma.userAuditEvent.deleteMany({
    where: { OR: [{ userId: USER_ID }, { actorUserId: USER_ID }] },
  });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  await prisma.$disconnect();
});

test("only one concurrent invitation can claim the credential read from the same snapshot", async () => {
  const nextHashes = Array.from({ length: 10 }, (_, index) => `new-hash-${index}`);
  const results = await Promise.all(
    nextHashes.map((nextHash) =>
      claimInvitationCredential(prisma, USER_ID, ORIGINAL_HASH, nextHash),
    ),
  );

  assert.equal(results.filter(Boolean).length, 1);

  const persisted = await prisma.user.findUniqueOrThrow({
    where: { id: USER_ID },
    select: { passwordHash: true },
  });
  assert.ok(nextHashes.includes(persisted.passwordHash));
});

test("late rollback cannot overwrite a newer credential", async () => {
  const failedAttemptHash = "failed-attempt-hash";
  const newerHash = "newer-hash";

  assert.equal(
    await claimInvitationCredential(prisma, USER_ID, ORIGINAL_HASH, failedAttemptHash),
    true,
  );

  await prisma.user.update({
    where: { id: USER_ID },
    data: { passwordHash: newerHash },
  });

  const rolledBack = await rollbackInvitationCredential(
    prisma,
    USER_ID,
    failedAttemptHash,
    ORIGINAL_HASH,
  );
  assert.equal(rolledBack, false);

  const persisted = await prisma.user.findUniqueOrThrow({
    where: { id: USER_ID },
    select: { passwordHash: true },
  });
  assert.equal(persisted.passwordHash, newerHash);
});

test("failed invitation can restore the previous credential when no newer change exists", async () => {
  const failedAttemptHash = "failed-attempt-hash";

  assert.equal(
    await claimInvitationCredential(prisma, USER_ID, ORIGINAL_HASH, failedAttemptHash),
    true,
  );
  assert.equal(
    await rollbackInvitationCredential(prisma, USER_ID, failedAttemptHash, ORIGINAL_HASH),
    true,
  );

  const persisted = await prisma.user.findUniqueOrThrow({
    where: { id: USER_ID },
    select: { passwordHash: true },
  });
  assert.equal(persisted.passwordHash, ORIGINAL_HASH);
});
