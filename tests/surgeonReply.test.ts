import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decideReplyDispatch,
  mailAuditDetail,
  planHold,
  readAutoReply,
  renderSurgeonReply,
  sealedProposalPayload,
} from "../src/lib/mailbox/surgeonReply";

const opening = {
  date: "2031-10-21",
  resourceId: "Q2",
  shift: "morning" as const,
  startMinutes: 8 * 60,
  endMinutes: 10 * 60,
  preferred: true,
};

test("AUTO_REPLY stays off unless the value is exactly true", () => {
  assert.equal(readAutoReply({}), false);
  assert.equal(readAutoReply({ AUTO_REPLY: "false" }), false);
  assert.equal(readAutoReply({ AUTO_REPLY: "1" }), false);
  assert.equal(readAutoReply({ AUTO_REPLY: "true" }), true);
});

test("a reply is not dispatched without an explicit click", () => {
  const off = decideReplyDispatch({
    explicitApproval: false,
    autoReply: false,
    missing: [],
    hasClash: false,
    checklistReady: true,
  });
  assert.equal(off.send, false);
  assert.match(off.reason, /apagado/);

  const clicked = decideReplyDispatch({
    explicitApproval: true,
    autoReply: false,
    missing: ["Seguro"],
    hasClash: true,
    checklistReady: false,
  });
  assert.equal(clicked.send, true);
  assert.match(clicked.reason, /clic/);
});

test("AUTO_REPLY only accepts a simple case and still does not transmit from this module", () => {
  const blocked = decideReplyDispatch({
    explicitApproval: false,
    autoReply: true,
    missing: ["Fecha"],
    hasClash: false,
    checklistReady: true,
  });
  assert.equal(blocked.send, false);

  const clash = decideReplyDispatch({
    explicitApproval: false,
    autoReply: true,
    missing: [],
    hasClash: true,
    checklistReady: true,
  });
  assert.equal(clash.send, false);

  const checklist = decideReplyDispatch({
    explicitApproval: false,
    autoReply: true,
    missing: [],
    hasClash: false,
    checklistReady: false,
  });
  assert.equal(checklist.send, false);

  const simple = decideReplyDispatch({
    explicitApproval: false,
    autoReply: true,
    missing: [],
    hasClash: false,
    checklistReady: true,
  });
  assert.equal(simple.send, true);
  assert.match(simple.reason, /sin enviar/);
});

test("the reply text proposes slots and a hold without patient identity", () => {
  const now = new Date("2031-10-20T08:00:00.000Z");
  const hold = planHold(opening, now);
  assert.equal(hold.status, "HOLD");
  assert.equal(hold.expiresAt.toISOString(), "2031-10-22T08:00:00.000Z");
  const reply = renderSurgeonReply({
    openings: [opening],
    missing: ["Seguro"],
    holdUntil: hold.expiresAt,
  });
  const serialized = JSON.stringify(reply);
  assert.match(reply.bodyPlain, /Q2 el 2031-10-21 por la mañana, desde las 08:00/);
  assert.match(reply.bodyPlain, /apartado hasta 2031-10-22/);
  assert.match(reply.bodyPlain, /pulsar Enviar/);
  assert.equal(serialized.includes("Paciente Prueba"), false);
  assert.equal(serialized.includes("TEST-"), false);
});

test("audit detail and the proposal payload drop identifying keys", () => {
  const detail = JSON.parse(mailAuditDetail({
    openings: 1,
    history: "HC-1",
    email: "cirujano@example.test",
    fullName: "Nombre",
    initials: "A.B.",
  })) as Record<string, unknown>;
  assert.equal(detail.openings, 1);
  assert.equal("history" in detail, false);
  assert.equal("email" in detail, false);
  assert.equal("fullName" in detail, false);
  assert.equal("initials" in detail, false);

  const sealed = sealedProposalPayload({
    surgeonName: "Muel",
    procedure: "Procedimiento prueba",
    emailMessageId: "no-debe-quedar",
    historyNumber: "TEST-0001",
    patientName: "Paciente Prueba 01",
  }, "msg-interno");
  assert.equal(sealed.sourceMessageId, "msg-interno");
  assert.equal(sealed.surgeonName, "Muel");
  assert.equal("emailMessageId" in sealed, false);
  assert.equal("historyNumber" in sealed, false);
  assert.equal("patientName" in sealed, false);
  assert.equal(JSON.stringify(sealed).includes("Paciente Prueba"), false);
  assert.equal(JSON.stringify(sealed).includes("TEST-"), false);
});

test("the reply path does not call a send operation and the migration only adds tables", () => {
  const reply = readFileSync(new URL("../src/lib/mailbox/surgeonReply.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/proposals/[id]/decision/route.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../prisma/migrations/20261021180000_mailbox_reply_audit/migration.sql", import.meta.url), "utf8");
  assert.equal(reply.includes("sendMail"), false);
  assert.equal(reply.includes("sendEmail"), false);
  assert.equal(route.includes("sendMail"), false);
  assert.equal(route.includes("sendEmail"), false);
  assert.match(reply, /sent: false/);
  assert.equal(sql.includes("UPDATE"), false);
  assert.equal(sql.includes("DROP"), false);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ProvisionalHold"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "MailboxAudit"/);
  assert.equal(sql.includes("EmailMessage"), false);
});
