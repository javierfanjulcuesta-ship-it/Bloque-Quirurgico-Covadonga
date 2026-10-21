import type { MailboxDraftInput, MailboxDraftRef, MailboxMessage, MailboxProvider } from "./types";

/**
 * Buzón de fichero o memoria. No llama a Microsoft y no envía.
 * Los tests le pasan los mensajes. MAILBOX_PROVIDER=file es el valor por defecto.
 */
export function createFileMailbox(messages: MailboxMessage[] = []): MailboxProvider & {
  drafts: Array<MailboxDraftInput & { draftId: string }>;
} {
  const drafts: Array<MailboxDraftInput & { draftId: string }> = [];
  return {
    name: "file",
    drafts,
    async listUnread(limit = 50): Promise<MailboxMessage[]> {
      return messages.slice(0, Math.max(0, limit));
    },
    async createReplyDraft(draft: MailboxDraftInput): Promise<MailboxDraftRef> {
      const draftId = `borrador-${drafts.length + 1}`;
      drafts.push({ ...draft, draftId });
      return { draftId };
    },
  };
}
