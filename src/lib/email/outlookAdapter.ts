/**
 * Adaptador para Microsoft Graph / Outlook.
 * El mock existe solo para desarrollo/test; en producción falla de forma explícita
 * para evitar que la aplicación reporte correos como enviados cuando no salieron.
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

function assertMockAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email real no configurado: el adaptador mock está deshabilitado en producción");
  }
}

/** Mock local. No envía correos reales y nunca imprime el cuerpo del mensaje. */
export function createMockOutlookAdapter(): OutlookAdapter {
  return {
    async send(params: SendEmailParams): Promise<void> {
      assertMockAllowed();
      if (process.env.NODE_ENV !== "test") {
        console.warn("[Email] MOCK – correo no enviado", {
          to: params.to,
          subject: params.subject,
          hasHtml: Boolean(params.bodyHtml),
          reply: Boolean(params.replyToMessageId),
        });
      }
    },

    async fetchInbox(_limit = 50): Promise<InboxMessage[]> {
      assertMockAllowed();
      return [];
    },
  };
}
