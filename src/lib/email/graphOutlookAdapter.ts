/**
 * Adaptador real de Microsoft Graph para envío de correos.
 * Envía en nombre de jfanjul@riberacare.com (o GESTOR_EMAIL).
 *
 * Requiere: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, GESTOR_EMAIL
 */

import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import type { OutlookAdapter, SendEmailParams } from "./outlookAdapter";
import type { InboxMessage } from "./types";

const GESTOR_EMAIL = process.env.GESTOR_EMAIL ?? "jfanjul@riberacare.com";

export function isGraphConfigured(): boolean {
  return !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_TENANT_ID
  );
}

export async function createGraphOutlookAdapter(): Promise<OutlookAdapter> {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      "Microsoft Graph no configurado: faltan AZURE_CLIENT_ID, AZURE_CLIENT_SECRET o AZURE_TENANT_ID"
    );
  }

  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };

  const cca = new ConfidentialClientApplication(msalConfig);

  async function getAccessToken(): Promise<string> {
    const result = await cca.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    if (!result?.accessToken) {
      throw new Error("No se pudo obtener token de Microsoft Graph");
    }
    return result.accessToken;
  }

  const client = Client.init({
    authProvider: async (done: (err: Error | null, token: string | null) => void) => {
      try {
        const token = await getAccessToken();
        done(null, token);
      } catch (err) {
        done(err as Error, null);
      }
    },
  });

  const userPrincipalName = GESTOR_EMAIL;

  return {
    async send(params: SendEmailParams): Promise<void> {
      try {
        const htmlContent = params.bodyHtml ?? params.bodyPlain.replace(/\n/g, "<br>");
        const message = {
          message: {
            subject: params.subject,
            body: {
              contentType: "HTML" as const,
              content: htmlContent,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: params.to,
                },
              },
            ],
          },
        };

        await client
          .api(`/users/${encodeURIComponent(userPrincipalName)}/sendMail`)
          .post(message);

        if (process.env.NODE_ENV !== "test") {
          console.log("[Email] Enviado vía Graph:", { to: params.to, subject: params.subject.slice(0, 50) });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = (err as { statusCode?: number }).statusCode;
        console.error("[Graph] Error al enviar email:", { to: params.to, error: msg, status });
        throw new Error(`Error al enviar correo: ${msg}`);
      }
    },

    async fetchInbox(_limit = 50): Promise<InboxMessage[]> {
      return [];
    },
  };
}
