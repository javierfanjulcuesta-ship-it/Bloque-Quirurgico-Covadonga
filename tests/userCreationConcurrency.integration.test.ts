import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createUserWithAudit } from "../src/lib/users/userCreationService";

const prisma = new PrismaClient();
const ACTOR_ID = "user-create-race-actor";
const EMAIL = "user-create-race@test.invalid";

async function cleanup(): Promise<void> {
  const target = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (target) {
    await prisma.userAuditEvent.deleteMany({
      where: { OR: [{ userId: target.id }, { actorUserId: target.id }] },
    });
  }
  await prisma.userAuditEvent.deleteMany({ where: { actorUserId: ACTOR_ID } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.user.deleteMany({ where: { id: ACTOR_ID } });
}

before(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      id: ACTOR_ID,
      email: "user-create-race-actor@test.invalid",
      passwordHash: "not-a-real-password-hash",
      name: "Gestor prueba creación",
      role: "GESTOR",
      approved: true,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("concurrent duplicate user creation yields exactly one user and one audit event", async () => {
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      createUserWithAudit(prisma, {
        email: EMAIL,
        passwordHash: `not-a-real-password-hash-${index}`,
        name: "Usuario carrera",
        role: "CIRUJANO",
        canSespa: false,
        actorUserId: ACTOR_ID,
      }),
    ),
  );

  assert.equal(attempts.filter((result) => result.ok).length, 1);
  assert.equal(attempts.filter((result) => !result.ok && result.code === "DUPLICATE_EMAIL").length, 9);

  const users = await prisma.user.findMany({ where: { email: EMAIL } });
  assert.equal(users.length, 1);

  const audits = await prisma.userAuditEvent.findMany({
    where: { userId: users[0]!.id, eventType: "USER_CREATED" },
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0]!.actorUserId, ACTOR_ID);
});
