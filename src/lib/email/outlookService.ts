/**
 * Servicio de correo Outlook / Microsoft 365.
 * Buzón principal: jfanjul@riberacare.com
 *
 * Usa Microsoft Graph real si hay credenciales; si no, adaptador mock.
 */

import type { UserRole } from "@/lib/types";
import { GESTOR_EMAIL } from "@/lib/config";
import { getEmailSubject, getEmailBody } from "@/lib/emailsNuevoUsuario";
import { getRecordatorioMiercolesSubject, getRecordatorioMiercolesBody } from "@/lib/emailsNuevoUsuario";
import { getPacienteNoAptoSubject, getPacienteNoAptoBody } from "@/lib/emailsNuevoUsuario";
import { createMockOutlookAdapter } from "./outlookAdapter";
import { createGraphOutlookAdapter, isGraphConfigured } from "./graphOutlookAdapter";
import { classifyIncomingEmail } from "./classifyEmail";
import { parseReservationEmail } from "./parseReservationEmail";
import type { InboxMessage, EmailClassification, ParsedReservationEmail } from "./types";

let _adapter: Awaited<ReturnType<typeof createMockOutlookAdapter>> | null = null;
let _adapterMode: "graph" | "mock" = "mock";

async function getAdapter() {
  if (_adapter) return _adapter;

  if (isGraphConfigured()) {
    try {
      _adapter = await createGraphOutlookAdapter();
      _adapterMode = "graph";
      if (process.env.NODE_ENV !== "test") {
        console.log("[Email] Usando Microsoft Graph real (jfanjul@riberacare.com)");
      }
    } catch (err) {
      _adapter = createMockOutlookAdapter();
      _adapterMode = "mock";
      console.warn("[Email] Graph no disponible, usando mock. Error:", err instanceof Error ? err.message : err);
    }
  } else {
    _adapter = createMockOutlookAdapter();
    _adapterMode = "mock";
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Email] Faltan AZURE_CLIENT_ID, AZURE_CLIENT_SECRET o AZURE_TENANT_ID. Usando mock (no se envían correos reales).");
    }
  }
  return _adapter;
}

/** Indica si el envío usa Microsoft Graph real o mock */
export function isUsingRealEmail(): boolean {
  return _adapterMode === "graph";
}

// --- Envío ---

export interface SendEmailOptions {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

/** Envía correo desde jfanjul@riberacare.com. Usa Graph real o mock según configuración. */
export async function sendEmail(params: SendEmailOptions): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send({
    to: params.to,
    subject: params.subject,
    bodyPlain: params.textBody,
    bodyHtml: params.htmlBody ?? params.textBody.replace(/\n/g, "<br>"),
  });
}

export interface NewUserInvitationParams {
  toEmail: string;
  role: UserRole;
  recipientName?: string;
  accessLink: string;
  initialPassword: string;
}

/** Envía invitación de nuevo usuario desde jfanjul@riberacare.com */
export async function sendNewUserInvitationEmail(params: NewUserInvitationParams): Promise<void> {
  const adapter = await getAdapter();
  const subject = getEmailSubject(params.role);
  const body = getEmailBody(params.role, {
    recipientName: params.recipientName,
    accessLink: params.accessLink,
    initialPassword: params.initialPassword,
  });
  await adapter.send({
    to: params.toEmail,
    subject,
    bodyPlain: body,
    bodyHtml: body.replace(/\n/g, "<br>"),
  });
}

export interface ReplyToReservationParams {
  toEmail: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

/** Responde a correo de reserva (aceptada, error formato, hueco ocupado, no autorizado) */
export async function sendReplyToReservationEmail(params: ReplyToReservationParams): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send({
    to: params.toEmail,
    subject: params.subject,
    bodyPlain: params.body,
    bodyHtml: params.body.replace(/\n/g, "<br>"),
    replyToMessageId: params.replyToMessageId,
  });
}

export interface GeneralReplyParams {
  toEmail: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

/** Responde a mensaje general de coordinación */
export async function sendGeneralReplyEmail(params: GeneralReplyParams): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send({
    to: params.toEmail,
    subject: params.subject,
    bodyPlain: params.body,
    bodyHtml: params.body.replace(/\n/g, "<br>"),
    replyToMessageId: params.replyToMessageId,
  });
}

/** Recordatorio miércoles: huecos sin pacientes */
export async function sendRecordatorioMiercolesEmail(toEmail: string, apellido: string): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send({
    to: toEmail,
    subject: getRecordatorioMiercolesSubject(),
    bodyPlain: getRecordatorioMiercolesBody(apellido),
  });
}

/** Paciente no apto en consulta de preanestesia */
export async function sendPacienteNoAptoEmail(toEmail: string, apellido: string): Promise<void> {
  const adapter = await getAdapter();
  await adapter.send({
    to: toEmail,
    subject: getPacienteNoAptoSubject(),
    bodyPlain: getPacienteNoAptoBody(apellido),
  });
}

// --- Lectura y clasificación ---

/** Obtiene mensajes de la bandeja de entrada del buzón gestor */
export async function fetchInboxMessages(limit = 50): Promise<InboxMessage[]> {
  const adapter = await getAdapter();
  return adapter.fetchInbox(limit);
}

/** Clasifica un correo entrante */
export function classifyIncomingEmailMessage(message: InboxMessage): EmailClassification {
  return classifyIncomingEmail(message);
}

/** Parsea un correo clasificado como reserva */
export function parseReservationEmailFromMessage(message: InboxMessage): ParsedReservationEmail | null {
  const result = parseReservationEmail({
    subject: message.subject,
    bodyPlain: message.bodyPlain,
  });
  return result.ok ? result.data : null;
}

// --- Utilidades ---

export { GESTOR_EMAIL };
export type { InboxMessage, EmailClassification, ParsedReservationEmail };
