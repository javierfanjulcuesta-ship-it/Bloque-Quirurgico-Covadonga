/**
 * Adaptador de envío de correo vía Gmail SMTP (nodemailer).
 * Usado cuando SMTP_HOST, SMTP_USER y SMTP_PASS están configurados.
 * No expone credenciales ni errores internos.
 */

import nodemailer from "nodemailer";
import type { OutlookAdapter, SendEmailParams } from "./outlookAdapter";
import type { InboxMessage } from "./types";

const SEND_TIMEOUT_MS = 15000;

export function isSmtpConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return !!(user && pass);
}

export async function createGmailAdapter(): Promise<OutlookAdapter> {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = process.env.SMTP_SECURE !== "false";

  if (!user || !pass) {
    throw new Error("SMTP no configurado: faltan SMTP_USER o SMTP_PASS");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return {
    async send(params: SendEmailParams): Promise<void> {
      const htmlContent = params.bodyHtml ?? params.bodyPlain.replace(/\n/g, "<br>");

      const mailOptions = {
        from: `"Gestión Bloque Quirúrgico" <${user}>`,
        to: params.to,
        subject: params.subject,
        text: params.bodyPlain,
        html: htmlContent,
      };

      try {
        await Promise.race([
          transporter.sendMail(mailOptions),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("SMTP timeout")), SEND_TIMEOUT_MS)
          ),
        ]);

        if (process.env.NODE_ENV !== "test") {
          console.log("[Email] Enviado vía SMTP:", { to: params.to, subject: params.subject.slice(0, 50) });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Email] Error SMTP:", { to: params.to, error: msg });
        throw new Error("Error al enviar correo");
      }
    },

    async fetchInbox(_limit = 50): Promise<InboxMessage[]> {
      return [];
    },
  };
}
