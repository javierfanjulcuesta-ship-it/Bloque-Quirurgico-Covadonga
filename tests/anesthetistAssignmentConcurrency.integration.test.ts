import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  loadAssignmentSnapshot,
  replaceAssignmentSnapshot,
  type AssignmentSnapshotRow,
} from "../src/lib/reservations/anesthetistAssignmentSnapshot";

const prisma = new PrismaClient();
const USERS = ["assignment-race-a", "assignment-race-b", "assignment-race-c"];
const DATE = "2031-03-03";

async function cleanup(): Promise<void> {
  await prisma.anesthetistAssignment.deleteMany({
    where: { anesthetistId: { in: USERS } },
  });
  await prisma.user.deleteMany({ where: { id: { in: USERS } } });
}

before(async () => {
  await cleanup();
  await prisma.user.createMany({
    data: USERS.map((id, index) => ({
      id,
      email: `${id}@test.invalid`,
      passwordHash: "not-a-real-password-hash",
      name: `Anestesista ficticio ${index + 1}`,
      role: "ANESTESISTA" as const,
      approved: true,
    })),
  });
  await prisma.anesthetistAssignment.create({
    data: {
      date: DATE,
      shift: "MORNING",
      assignmentType: "OR",
      resourceId: "Q1",
      anesthetistId: USERS[0]!,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("two managers cannot overwrite each other from the same loaded revision", async () => {
  const loaded = await loadAssignmentSnapshot(prisma);

  const snapshotA: AssignmentSnapshotRow[] = [
    {
      date: DATE,
      shift: "MORNING",
      assignmentType: "OR",
      resourceId: "Q1",
      anesthetistId: USERS[1]!,
    },
  ];
  const snapshotB: AssignmentSnapshotRow[] = [
    {
      date: DATE,
      shift: "MORNING",
      assignmentType: "OR",
      resourceId: "Q1",
      anesthetistId: USERS[2]!,
    },
  ];

  const [a, b] = await Promise.all([
    replaceAssignmentSnapshot(prisma, loaded.revision, snapshotA),
    replaceAssignmentSnapshot(prisma, loaded.revision, snapshotB),
  ]);

  const results = [a, b];
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.reason === "stale_revision").length, 1);

  const final = await prisma.anesthetistAssignment.findMany({
    where: { date: DATE },
    select: { anesthetistId: true, resourceId: true },
  });
  assert.equal(final.length, 1);
  assert.equal(final[0]!.resourceId, "Q1");
  assert.ok(final[0]!.anesthetistId === USERS[1] || final[0]!.anesthetistId === USERS[2]);
});

test("a stale empty snapshot cannot wipe newer assignments", async () => {
  const loaded = await loadAssignmentSnapshot(prisma);
  const next: AssignmentSnapshotRow[] = [
    {
      date: DATE,
      shift: "AFTERNOON",
      assignmentType: "OR",
      resourceId: "Q2",
      anesthetistId: USERS[0]!,
    },
  ];

  const first = await replaceAssignmentSnapshot(prisma, loaded.revision, next);
  assert.equal(first.ok, true);

  const staleClear = await replaceAssignmentSnapshot(prisma, loaded.revision, []);
  assert.equal(staleClear.ok, false);
  if (!staleClear.ok) assert.equal(staleClear.reason, "stale_revision");

  const final = await prisma.anesthetistAssignment.findMany({ where: { date: DATE } });
  assert.equal(final.length, 1);
  assert.equal(final[0]!.resourceId, "Q2");
});
