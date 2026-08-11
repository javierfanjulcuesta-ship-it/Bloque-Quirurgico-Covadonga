import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { deactivateUser, reactivateUser, softDeleteUser } from "../src/lib/users/userLifecycleService";

const prisma = new PrismaClient();
const MANAGER_A = "lifecycle-manager-a";
const MANAGER_B = "lifecycle-manager-b";

async function cleanup() {
  await prisma.userAuditEvent.deleteMany({
    where: {
      OR: [
        { userId: { in: [MANAGER_A, MANAGER_B] } },
        { actorUserId: { in: [MANAGER_A, MANAGER_B] } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: [MANAGER_A, MANAGER_B] } } });
}

async function seedManagers() {
  await cleanup();
  await prisma.user.createMany({
    data: [
      {
        id: MANAGER_A,
        email: "lifecycle-manager-a@test.invalid",
        passwordHash: "not-a-real-password-hash",
        name: "Manager A",
        role: "GESTOR",
        approved: true,
      },
      {
        id: MANAGER_B,
        email: "lifecycle-manager-b@test.invalid",
        passwordHash: "not-a-real-password-hash",
        name: "Manager B",
        role: "GESTOR_ANESTESISTA",
        approved: true,
      },
    ],
  });
}

before(async () => {
  await seedManagers();
});

beforeEach(async () => {
  await seedManagers();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("concurrent manager deactivation cannot leave the system without an active manager", async () => {
  const [a, b] = await Promise.all([
    deactivateUser(prisma, { targetUserId: MANAGER_B, actorUserId: MANAGER_A }),
    deactivateUser(prisma, { targetUserId: MANAGER_A, actorUserId: MANAGER_B }),
  ]);

  const results = [a, b];
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.code === "LAST_MANAGER").length, 1);

  const activeManagers = await prisma.user.count({
    where: {
      id: { in: [MANAGER_A, MANAGER_B] },
      approved: true,
      deletedAt: null,
    },
  });
  assert.equal(activeManagers, 1);

  const audits = await prisma.userAuditEvent.findMany({
    where: { eventType: "USER_DEACTIVATED", userId: { in: [MANAGER_A, MANAGER_B] } },
  });
  assert.equal(audits.length, 1);
});

test("soft deleting the last active manager is rejected", async () => {
  const first = await deactivateUser(prisma, { targetUserId: MANAGER_B, actorUserId: MANAGER_A });
  assert.equal(first.ok, true);

  const deletion = await softDeleteUser(prisma, { targetUserId: MANAGER_A, actorUserId: MANAGER_B });
  assert.equal(deletion.ok, false);
  if (!deletion.ok) assert.equal(deletion.code, "LAST_MANAGER");

  const managerA = await prisma.user.findUniqueOrThrow({ where: { id: MANAGER_A } });
  assert.equal(managerA.approved, true);
  assert.equal(managerA.deletedAt, null);
});

test("reactivation restores a soft-deleted user and writes an audit event atomically", async () => {
  const deleted = await softDeleteUser(prisma, { targetUserId: MANAGER_B, actorUserId: MANAGER_A });
  assert.equal(deleted.ok, true);

  const restored = await reactivateUser(prisma, { targetUserId: MANAGER_B, actorUserId: MANAGER_A });
  assert.equal(restored.ok, true);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: MANAGER_B } });
  assert.equal(user.approved, true);
  assert.equal(user.deletedAt, null);
  assert.equal(user.deletedByUserId, null);

  const audit = await prisma.userAuditEvent.findFirst({
    where: { userId: MANAGER_B, eventType: "USER_REACTIVATED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit);
});
