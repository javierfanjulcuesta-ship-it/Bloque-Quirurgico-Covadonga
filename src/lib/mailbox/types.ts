/**
 * Buzón de solo lectura y borradores. Ninguna implementación envía correo.
 */

export interface MailboxMessage {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyPlain: string;
  receivedAt: string;
}

export interface MailboxDraftInput {
  to: string;
  subject: string;
  bodyPlain: string;
  inReplyToId?: string | null;
}

export interface MailboxDraftRef {
  draftId: string;
}

export interface MailboxProvider {
  readonly name: "file" | "graph";
  listUnread(limit?: number): Promise<MailboxMessage[]>;
  createReplyDraft(draft: MailboxDraftInput): Promise<MailboxDraftRef>;
}

export interface GraphMailboxConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxUser: string;
}

export function graphConfigFromEnv(env: Record<string, string | undefined>): GraphMailboxConfig | null {
  const tenantId = env.GRAPH_TENANT_ID?.trim() ?? "";
  const clientId = env.GRAPH_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GRAPH_CLIENT_SECRET?.trim() ?? "";
  const mailboxUser = env.GRAPH_MAILBOX_USER?.trim() ?? "";
  if (!tenantId || !clientId || !clientSecret || !mailboxUser) return null;
  return { tenantId, clientId, clientSecret, mailboxUser };
}
