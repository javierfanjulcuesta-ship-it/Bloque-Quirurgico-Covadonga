import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { changePasswordWithAudit } from "../src/lib/users/userPasswordChangeService";

const prisma = new PrismaClient();
const USER_ID = "password-change-race-user";
const INITIAL_HASH = "hash-initial-password-change-race";

async function cleanup(): Promise<void> {
  await prisma.userAuditEvent.deleteMany({
    where: { OR: [{ userId: USER_ID }, { actorUserId: USER_ID }] },
  });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

before(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: "password-change-race@test.invalid",
      passwordHash: INITIAL_HASH,
      name: "Usuario cambio contraseña",
      role: "ANESTESISTA",
      approved: true,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("two concurrent self-service password changes cannot overwrite each other", async () => {
  const [a, b] = await Promise.all([
    changePasswordWithAudit(prisma, {
      userId: USER_ID,
      expectedPasswordHash: INITIAL_HASH,
      nextPasswordHash: "hash-next-a",
    }),
    changePasswordWithAudit(prisma, {
      userId: USER_ID,
      expectedPasswordHash: INITIAL_HASH,
      nextPasswordHash: "hash-next-b",
    }),
  ]);

  assert.equal([a, b].filter((result) => result.ok).length, 1);
  assert.equal([a, b].filter((result) => !result.ok && result.code === "STALE_CREDENTIAL").length, 1);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
  assert.ok(user.passwordHash === "hash-next-a" || user.passwordHash === "hash-next-b");

  const audits = await prisma.userAuditEvent.findMany({
    where: { userId: USER_ID, eventType: "USER_PASSWORD_CHANGED" },
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0]!.actorUserId, USER_ID);
});

test("stale password change cannot replace a newer credential", async () => {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
  const staleExpected = `${current.passwordHash}-stale`;

  const result = await changePasswordWithAudit(prisma, {
    userId: USER_ID,
    expectedPasswordHash: staleExpected,
    nextPasswordHash: "hash-should-never-be-installed",
  });

  assert.equal(result.ok, false);
  const afterAttempt = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
  assert.equal(afterAttempt.passwordHash, current.passwordHash);
});
