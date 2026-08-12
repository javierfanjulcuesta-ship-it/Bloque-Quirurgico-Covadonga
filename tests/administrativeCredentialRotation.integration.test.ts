import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { rotateAdministrativeCredential } from "../src/lib/users/administrativeCredentialRotation";

const prisma = new PrismaClient();
const USER_ID = "admin-credential-race-user";
const ACTOR_ID = "admin-credential-race-actor";
const INITIAL_HASH = "admin-credential-initial-hash";

async function cleanup(): Promise<void> {
  await prisma.userAuditEvent.deleteMany({
    where: {
      OR: [
        { userId: USER_ID },
        { actorUserId: USER_ID },
        { userId: ACTOR_ID },
        { actorUserId: ACTOR_ID },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: [USER_ID, ACTOR_ID] } } });
}

before(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: ACTOR_ID,
        email: "admin-credential-race-actor@test.invalid",
        passwordHash: "actor-hash",
        name: "Gestor carrera credencial",
        role: "GESTOR",
        approved: true,
      },
      {
        id: USER_ID,
        email: "admin-credential-race-user@test.invalid",
        passwordHash: INITIAL_HASH,
        name: "Usuario carrera credencial",
        role: "CIRUJANO",
        approved: true,
      },
    ],
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("concurrent administrative password regeneration yields one valid response and audit", async () => {
  const [a, b] = await Promise.all([
    rotateAdministrativeCredential(prisma, {
      userId: USER_ID,
      expectedPasswordHash: INITIAL_HASH,
      nextPasswordHash: "admin-credential-next-a",
      actorUserId: ACTOR_ID,
    }),
    rotateAdministrativeCredential(prisma, {
      userId: USER_ID,
      expectedPasswordHash: INITIAL_HASH,
      nextPasswordHash: "admin-credential-next-b",
      actorUserId: ACTOR_ID,
    }),
  ]);

  assert.equal([a, b].filter((result) => result.ok).length, 1);
  assert.equal([a, b].filter((result) => !result.ok && result.code === "STALE_CREDENTIAL").length, 1);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } });
  assert.ok(user.passwordHash === "admin-credential-next-a" || user.passwordHash === "admin-credential-next-b");

  const audits = await prisma.userAuditEvent.findMany({
    where: { userId: USER_ID, eventType: "USER_PASSWORD_REGENERATED" },
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0]!.actorUserId, ACTOR_ID);
});
