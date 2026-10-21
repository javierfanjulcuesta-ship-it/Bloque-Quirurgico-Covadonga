import type { GraphMailboxConfig, MailboxDraftInput, MailboxDraftRef, MailboxMessage, MailboxProvider } from "./types";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function plainText(contentType: string | undefined, content: string): string {
  if (/html/i.test(contentType ?? "")) {
    return content
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return content;
}

async function defaultToken(config: GraphMailboxConfig, fetchImpl: FetchLike): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!response.ok) throw new Error("Microsoft Graph no entregó un token");
  const json = await response.json() as { access_token?: string };
  if (!json.access_token) throw new Error("Microsoft Graph no entregó un token");
  return json.access_token;
}

/**
 * Lee la bandeja y crea borradores. No envía el mensaje.
 * Hace falta Mail.Read y Mail.ReadWrite. No hace falta Mail.Send.
 */
export function createGraphMailbox(
  config: GraphMailboxConfig,
  deps: { fetch?: FetchLike; token?: () => Promise<string> } = {},
): MailboxProvider {
  const fetchImpl = deps.fetch ?? fetch;
  const token = deps.token ?? (() => defaultToken(config, fetchImpl));
  const user = encodeURIComponent(config.mailboxUser);

  async function graph(url: string, init: RequestInit): Promise<Response> {
    const access = await token();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${access}`);
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    return fetchImpl(url, { ...init, headers });
  }

  return {
    name: "graph",
    async listUnread(limit = 50): Promise<MailboxMessage[]> {
      const top = Math.min(50, Math.max(1, limit));
      const url = `https://graph.microsoft.com/v1.0/users/${user}/mailFolders/inbox/messages?$filter=isRead eq false&$top=${top}&$select=id,subject,from,body,receivedDateTime`;
      const response = await graph(url, { method: "GET" });
      if (!response.ok) throw new Error("No se pudo leer la bandeja de Graph");
      const json = await response.json() as {
        value?: Array<{
          id?: string;
          subject?: string;
          receivedDateTime?: string;
          from?: { emailAddress?: { address?: string; name?: string } };
          body?: { contentType?: string; content?: string };
        }>;
      };
      return (json.value ?? []).flatMap((item) => {
        const id = item.id?.trim();
        const fromEmail = item.from?.emailAddress?.address?.trim().toLowerCase();
        if (!id || !fromEmail) return [];
        return [{
          id,
          fromEmail,
          fromName: item.from?.emailAddress?.name?.trim() || null,
          subject: item.subject?.trim() || "Correo recibido",
          bodyPlain: plainText(item.body?.contentType, item.body?.content ?? ""),
          receivedAt: item.receivedDateTime ?? new Date().toISOString(),
        }];
      });
    },
    async createReplyDraft(draft: MailboxDraftInput): Promise<MailboxDraftRef> {
      const replyId = draft.inReplyToId?.trim();
      if (replyId) {
        const created = await graph(
          `https://graph.microsoft.com/v1.0/users/${user}/messages/${encodeURIComponent(replyId)}/createReply`,
          { method: "POST" },
        );
        if (!created.ok) throw new Error("Graph no creó el borrador de respuesta");
        const reply = await created.json() as { id?: string };
        if (!reply.id) throw new Error("Graph no creó el borrador de respuesta");
        const patched = await graph(
          `https://graph.microsoft.com/v1.0/users/${user}/messages/${encodeURIComponent(reply.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              subject: draft.subject,
              body: { contentType: "Text", content: draft.bodyPlain },
            }),
          },
        );
        if (!patched.ok) throw new Error("Graph no actualizó el borrador");
        return { draftId: reply.id };
      }
      const response = await graph(
        `https://graph.microsoft.com/v1.0/users/${user}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            subject: draft.subject,
            body: { contentType: "Text", content: draft.bodyPlain },
            toRecipients: [{ emailAddress: { address: draft.to } }],
            isDraft: true,
          }),
        },
      );
      if (!response.ok) throw new Error("Graph no creó el borrador");
      const json = await response.json() as { id?: string };
      if (!json.id) throw new Error("Graph no creó el borrador");
      return { draftId: json.id };
    },
  };
}
