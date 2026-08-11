import test, { after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { processIncomingEmail } from "../src/lib/email/processIncomingEmail";
import type { InboxMessage } from "../src/lib/email/types";

const prisma = new PrismaClient();
const EXTERNAL_ID = "email-idempotency-concurrent-test";

async function cleanup(): Promise<void> {
  const rows = await prisma.emailMessage.findMany({
    where: { externalId: EXTERNAL_ID },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await prisma.emailProcessingLog.deleteMany({ where: { emailMessageId: { in: ids } } });
  }
  await prisma.emailMessage.deleteMany({ where: { externalId: EXTERNAL_ID } });
}

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("concurrent duplicate webhook deliveries are claimed once without P2002 failures", async () => {
  await cleanup();
  const message: InboxMessage = {
    id: EXTERNAL_ID,
    fromEmail: "duplicate-delivery@test.invalid",
    subject: "Mensaje general de coordinación",
    bodyPlain: "Consulta general sin datos de paciente ni solicitud de reserva.",
    receivedAt: "2031-05-07T09:00:00.000Z",
  };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => processIncomingEmail(message)),
  );

  const ids = new Set(results.map((result) => result.emailMessageId));
  assert.equal(ids.size, 1);

  const persisted = await prisma.emailMessage.findMany({ where: { externalId: EXTERNAL_ID } });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]!.processingStatus, "SKIPPED");

  const logs = await prisma.emailProcessingLog.findMany({
    where: { emailMessageId: persisted[0]!.id },
  });
  assert.equal(logs.filter((log) => log.action === "classified").length, 1);
});
