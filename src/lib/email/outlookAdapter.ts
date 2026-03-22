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

/** Mock para desarrollo local. No envía correos reales. Loguea el contenido completo en consola para pruebas. */
export function createMockOutlookAdapter(): OutlookAdapter {
  return {
    async send(params: SendEmailParams): Promise<void> {
      if (process.env.NODE_ENV !== "test") {
        console.log("[Email] MOCK – Simulado (no enviado):", { to: params.to, subject: params.subject });
        console.log("-------- [Email Mock] CUERPO TEXTO --------");
        console.log(params.bodyPlain);
        if (params.bodyHtml) {
          console.log("-------- [Email Mock] CUERPO HTML (primeras 2000 chars) --------");
          console.log(params.bodyHtml.slice(0, 2000) + (params.bodyHtml.length > 2000 ? "\n... [truncado]" : ""));
        }
        console.log("-------- [Email Mock] FIN --------");
      }
    },

    async fetchInbox(_limit = 50): Promise<InboxMessage[]> {
      return [];
    },
  };
}
