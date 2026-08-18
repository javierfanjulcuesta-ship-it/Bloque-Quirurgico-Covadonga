import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { runProgrammedPatientNotificationWorker } from "../src/lib/email/programmedPatientNotificationWorker";
import fs from "node:fs";
import path from "node:path";

function fakePrismaForSingleMessage() {
  let claimed = false;
  const updates: Array<Record<string, unknown>> = [];
  const delegate = {
    async findFirst() {
      return claimed ? null : { id: "outbox-demo-1" };
    },
    async updateMany() {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    },
    async findUnique() {
      return {
        id: "outbox-demo-1",
        recipientEmail: "gestion-citas@demo.invalid",
        subject: "[QxFlow][NUEVA CITA] Paciente programado",
        bodyText: "Contenido sintético sin datos reales.",
        attemptCount: 1,
      };
    },
    async update(args: { data: Record<string, unknown> }) {
      updates.push(args.data);
      return {};
    },
  };
  return {
    prisma: { programmedPatientNotificationOutbox: delegate } as unknown as PrismaClient,
    updates,
  };
}

test("worker delivers a claimed message once and clears retained body after success", async () => {
  const { prisma, updates } = fakePrismaForSingleMessage();
  const deliveries: string[] = [];
  const result = await runProgrammedPatientNotificationWorker({
    prisma,
    maxMessages: 10,
    now: () => new Date("2026-08-18T01:00:00.000Z"),
    async deliver({ to, subject, textBody }) {
      deliveries.push(`${to}|${subject}|${textBody}`);
    },
  });

  assert.equal(deliveries.length, 1);
  assert.deepEqual(result, {
    processed: 1,
    sent: 1,
    retryScheduled: 0,
    exhausted: 0,
    invalidPayload: 0,
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.status, "SENT");
  assert.equal(updates[0]?.bodyText, null);
  assert.equal(updates[0]?.leaseUntil, null);
});

test("worker schedules retry and releases lease when delivery fails", async () => {
  const { prisma, updates } = fakePrismaForSingleMessage();
  const result = await runProgrammedPatientNotificationWorker({
    prisma,
    maxMessages: 1,
    now: () => new Date("2026-08-18T01:00:00.000Z"),
    async deliver() {
      throw new Error("synthetic provider outage");
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.retryScheduled, 1);
  assert.equal(result.sent, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.status, "FAILED");
  assert.equal(updates[0]?.leaseUntil, null);
  assert.equal(updates[0]?.lastError, "synthetic provider outage");
});

test("cron handler keeps isolated-demo and bearer-secret guards before worker execution", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/cron/programmed-patient-notifications/route.ts"),
    "utf8",
  );
  const isolatedGuard = route.indexOf('process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo"');
  const secretGuard = route.indexOf("const secret = process.env.CRON_SECRET");
  const workerCall = route.indexOf("runProgrammedPatientNotificationWorker({");
  assert.ok(isolatedGuard >= 0);
  assert.ok(secretGuard > isolatedGuard);
  assert.ok(workerCall > secretGuard);
  assert.match(route, /bearerToken/);
  assert.match(route, /secretsEqual/);
});
