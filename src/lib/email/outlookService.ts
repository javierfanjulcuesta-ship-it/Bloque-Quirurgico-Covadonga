/**
 * Servicio de correo Outlook / Microsoft 365.
 * El buzón remitente se configura por entorno; no se hardcodean direcciones reales.
 *
 * Usa Microsoft Graph real si hay credenciales; si no, adaptador mock fuera de producción.
 */

import type { UserRole } from "@/lib/types";
import { GESTOR_EMAIL } from "@/lib/config";
import { buildInvitationEmail } from "@/lib/email/invitationEmail";
import { getRecordatorioMiercolesSubject, getRecordatorioMiercolesBody } from "@/lib/emailsNuevoUsuario";
import { getPacienteNoAptoSubject, getPacienteNoAptoBody } from "@/lib/emailsNuevoUsuario";
import { buildReleaseNotificationEmail } from "./releaseNotificationEmail";
import type { ReleasedSlotInfo } from "./releaseNotificationEmail";
import { createMockOutlookAdapter } from "./outlookAdapter";
import { createGraphOutlookAdapter, isGraphConfigured } from "./graphOutlookAdapter";
import { createGmailAdapter, isSmtpConfigured } from "./gmailAdapter";
import { classifyIncomingEmail } from "./classifyEmail";
import { parseReservationEmail } from "./parseReservationEmail";
import { emailProviderUnavailableMessage, isEmailMockAllowed } from "./emailRuntimePolicy";
import type { InboxMessage, EmailClassification, ParsedReservationEmail } from "./types";

let _adapter: Awaited<ReturnType<typeof createMockOutlookAdapter>> | null = null;
let _adapterMode: "smtp" | "graph" | "mock" = "mock";

function unavailableProviderError(provider?: "smtp" | "graph", cause?: unknown): Error {
  const message = emailProviderUnavailableMessage(provider);
  if (cause instanceof Error) return new Error(message, { cause });
  return new Error(message);
}

async function getAdapter() {
  if (_adapter) return _adapter;

  // Prioridad: SMTP → Graph → Mock. En producción nunca se degrada silenciosamente a mock.
  if (isSmtpConfigured()) {
    try {
      _adapter = await createGmailAdapter();
      _adapterMode = "smtp";
      if (process.env.NODE_ENV !== "test") {
        console.log("[Email] Usando SMTP (Gmail) – correos reales");
      }
    } catch (err) {
      if (!isEmailMockAllowed(process.env.NODE_ENV)) {
        console.error("[Email] SMTP configurado pero no disponible en producción:", err instanceof Error ? err.message : "error desconocido");
        throw unavailableProviderError("smtp", err);
      }
      _adapter = createMockOutlookAdapter();
      _adapterMode = "mock";
      console.warn("[Email] SMTP no disponible, usando mock fuera de producción. Error:", err instanceof Error ? err.message : err);
    }
  } else if (isGraphConfigured()) {
    try {
      _adapter = await createGraphOutlookAdapter();
      _adapterMode = "graph";
      if (process.env.NODE_ENV !== "test") {
        console.log("[Email] Usando Graph – correos reales");
      }
    } catch (err) {
      if (!isEmailMockAllowed(process.env.NODE_ENV)) {
        console.error("[Email] Graph configurado pero no disponible en producción:", err instanceof Error ? err.message : "error desconocido");
        throw unavailableProviderError("graph", err);
      }
      _adapter = createMockOutlookAdapter();
      _adapterMode = "mock";
      console.warn("[Email] Graph no disponible, usando mock fuera de producción. Error:", err instanceof Error ? err.message : err);
    }
  } else {
    if (!isEmailMockAllowed(process.env.NODE_ENV)) {
      console.error("[Email] Ningún proveedor de correo real configurado en producción");
      throw unavailableProviderError();
    }
    _adapter = createMockOutlookAdapter();
    _adapterMode = "mock";
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Email] MOCK – Configure SMTP o Azure para envío real.");
    }
  }
  return _adapter;
}

/** Indica si el envío usa SMTP, Graph o mock */
export function isUsingRealEmail(): boolean {
  return _adapterMode === "smtp" || _adapterMode === "graph";
}

// --- Envío ---

export interface SendEmailOptions {
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send(options);
}

export async function sendNewUserInvitationEmail(params: {
  to: string;
  name: string;
  role: UserRole;
  temporaryPassword: string;
  invitedByName: string;
  expiresAt?: Date;
}): Promise<void> {
  const email = buildInvitationEmail({
    name: params.name,
    email: params.to,
    temporaryPassword: params.temporaryPassword,
    role: params.role,
    invitedByName: params.invitedByName,
    expiresAt: params.expiresAt,
  });

  await sendEmail({
    to: params.to,
    subject: email.subject,
    bodyPlain: email.bodyPlain,
    bodyHtml: email.bodyHtml,
  });
}

export async function sendReplyToReservationEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sendEmail({ to, subject, bodyPlain: body });
}

export async function sendGeneralReplyEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sendEmail({ to, subject, bodyPlain: body });
}

export async function sendRecordatorioMiercolesEmail(params: {
  to: string;
  userName: string;
  weekStartLabel: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: getRecordatorioMiercolesSubject(params.weekStartLabel),
    bodyPlain: getRecordatorioMiercolesBody(params.userName, params.weekStartLabel),
  });
}

export async function sendPacienteNoAptoEmail(params: {
  to: string;
  userName: string;
  patientName: string;
  surgeryDateLabel: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: getPacienteNoAptoSubject(params.patientName),
    bodyPlain: getPacienteNoAptoBody(
      params.userName,
      params.patientName,
      params.surgeryDateLabel
    ),
  });
}

export async function sendReleaseNotificationToSurgeons(
  slots: ReleasedSlotInfo[],
  surgeonEmails: string[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const email = buildReleaseNotificationEmail(slots);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const to of surgeonEmails) {
    try {
      await sendEmail({
        to,
        subject: email.subject,
        bodyPlain: email.bodyPlain,
        bodyHtml: email.bodyHtml,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      errors.push(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return { sent, failed, errors };
}

// --- Bandeja / clasificación ---

export async function fetchInboxMessages(limit = 50): Promise<InboxMessage[]> {
  const adapter = await getAdapter();
  return adapter.fetchInbox(limit);
}

export function classifyIncomingEmailMessage(message: InboxMessage): EmailClassification {
  return classifyIncomingEmail(message);
}

export function parseReservationEmailFromMessage(message: InboxMessage): ParsedReservationEmail | null {
  return parseReservationEmail(message);
}

export { GESTOR_EMAIL };
