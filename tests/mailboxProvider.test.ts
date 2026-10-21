import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createMailboxFromEnv } from "../src/lib/mailbox/createMailbox";
import { createFileMailbox } from "../src/lib/mailbox/fileMailbox";
import { createGraphMailbox } from "../src/lib/mailbox/graphMailbox";

const CONFIG = {
  tenantId: "tenant-de-prueba",
  clientId: "client-de-prueba",
  clientSecret: "secreto-de-prueba",
  mailboxUser: "coordinacion@example.com",
};

test("the default mailbox is the file provider and graph refuses to start half configured", async () => {
  const mailbox = createMailboxFromEnv({});
  assert.equal(mailbox.name, "file");
  assert.deepEqual(await mailbox.listUnread(), []);
  assert.throws(
    () => createMailboxFromEnv({ MAILBOX_PROVIDER: "graph", GRAPH_TENANT_ID: "tenant-de-prueba" }),
    /GRAPH_MAILBOX_USER/,
  );
});

test("the file mailbox keeps drafts in memory and does not need credentials", async () => {
  const mailbox = createFileMailbox([{
    id: "m1",
    fromEmail: "cirujano@example.com",
    fromName: "Cirujano Demo",
    subject: "Solicitud",
    bodyPlain: "procedimiento: artroscopia",
    receivedAt: "2031-10-20T08:00:00.000Z",
  }]);
  assert.equal((await mailbox.listUnread(10)).length, 1);
  const draft = await mailbox.createReplyDraft({
    to: "cirujano@example.com",
    subject: "Huecos propuestos",
    bodyPlain: "Q2 el 2031-10-21 por la mañana.",
  });
  assert.equal(draft.draftId, "borrador-1");
  assert.equal(mailbox.drafts[0]?.bodyPlain.includes("Q2"), true);
});

test("graph lists unread mail and creates a draft without sendMail", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/token")) {
      return new Response(JSON.stringify({ access_token: "token-de-prueba" }), { status: 200 });
    }
    if (url.includes("/createReply")) {
      return new Response(JSON.stringify({ id: "draft-9" }), { status: 201 });
    }
    if (init?.method === "PATCH") return new Response("{}", { status: 200 });
    if (url.includes("/messages?")) {
      return new Response(JSON.stringify({
        value: [{
          id: "graph-1",
          subject: "Solicitud",
          receivedDateTime: "2031-10-20T08:00:00Z",
          from: { emailAddress: { address: "Cirujano@example.com", name: "Cirujano Demo" } },
          body: { contentType: "HTML", content: "<p>Paciente Prueba 01</p>" },
        }],
      }), { status: 200 });
    }
    return new Response("no", { status: 500 });
  };

  const mailbox = createGraphMailbox(CONFIG, { fetch: fetchImpl });
  const messages = await mailbox.listUnread(10);
  assert.equal(messages[0]?.fromEmail, "cirujano@example.com");
  assert.equal(messages[0]?.bodyPlain, "Paciente Prueba 01");
  const draft = await mailbox.createReplyDraft({
    to: "cirujano@example.com",
    subject: "Huecos",
    bodyPlain: "Propuesta",
    inReplyToId: "graph-1",
  });
  assert.equal(draft.draftId, "draft-9");
  assert.equal(calls.some((call) => call.includes("sendMail")), false);
  assert.equal(calls.some((call) => call.includes("/createReply")), true);

  const source = readFileSync("src/lib/mailbox/graphMailbox.ts", "utf8");
  assert.equal(source.includes("sendMail"), false);
});
