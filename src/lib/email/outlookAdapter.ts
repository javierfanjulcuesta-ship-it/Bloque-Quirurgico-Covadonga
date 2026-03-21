/**
 * Adaptador para Microsoft Graph / Outlook.
 * En producción usa @microsoft/microsoft-graph-client.
 * En desarrollo usa mock que simula envío y lectura.
 */

import type { InboxMessage } from "./types";

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
  replyToMessageId?: string;
}

export interface OutlookAdapter {
  send(params: SendEmailParams): Promise<void>;
  fetchInbox(limit?: number): Promise<InboxMessage[]>;
}

/** Mock para desarrollo local. No envía correos reales. */
export function createMockOutlookAdapter(): OutlookAdapter {
  return {
    async send(params: SendEmailParams): Promise<void> {
      if (process.env.NODE_ENV !== "test") {
        console.log("[Email Mock] Simulado:", { to: params.to, subject: params.subject.slice(0, 50) });
      }
    },

    async fetchInbox(_limit = 50): Promise<InboxMessage[]> {
      return [];
    },
  };
}
