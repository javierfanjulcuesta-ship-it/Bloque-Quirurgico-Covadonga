/**
 * Plantillas de email para nuevo usuario por perfil.
 * La construcción de invitación se delega en buildInvitationEmail (lib/email/invitationEmail.ts).
 * Se usa al crear un usuario desde el gestor; el correo se abre en el cliente de correo.
 */

import type { UserRole } from "./types";
import { buildInvitationEmail } from "./email/invitationEmail";

/** Reexportación para compatibilidad con usos existentes (ValoracionPreanestesia, etc.) */
export { NORMAS_PROGRAMACION_BLOQUE } from "./email/emailConstants";

/** @deprecated Usar buildInvitationEmail. Mantiene compatibilidad con mailto fallback en CrearNuevoUsuario. */
export function getEmailSubject(role: UserRole): string {
  return buildInvitationEmail({
    name: "",
    email: "",
    role,
    appUrl: "",
    temporaryPassword: "",
  }).subject;
}

export interface EmailBodyOptions {
  /** Nombre del destinatario */
  recipientName?: string;
  /** URL de acceso al sistema */
  accessLink?: string;
  /** Contraseña inicial generada */
  initialPassword?: string;
}

/** @deprecated Usar buildInvitationEmail. Mantiene compatibilidad con mailto fallback en CrearNuevoUsuario. */
export function getEmailBody(role: UserRole, options?: EmailBodyOptions): string {
  return buildInvitationEmail({
    name: options?.recipientName ?? "",
    email: "",
    role,
    appUrl: options?.accessLink ?? "",
    temporaryPassword: options?.initialPassword ?? "",
  }).text;
}

/** Genera enlace mailto: con asunto y cuerpo codificados (para abrir cliente de correo). */
export function buildMailtoLink(toEmail: string, subject: string, body: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${encodeURIComponent(toEmail)}?subject=${encodedSubject}&body=${encodedBody}`;
}

// --- Recordatorio miércoles: huecos reservados sin pacientes ---
const ASUNTO_RECORDATORIO = "Recordatorio de programación de quirófano – huecos pendientes";

const CUERPO_RECORDATORIO = (apellido: string) => `Estimado/a Dr./Dra. ${apellido},

Le enviamos este mensaje como recordatorio de que actualmente tiene huecos de quirófano reservados para la próxima semana que aún no cuentan con pacientes programados.

Le agradeceríamos, si es posible, que revise la programación en la aplicación del bloque quirúrgico y complete la planificación de los casos previstos.

Tal y como se ha establecido en la organización del bloque, cada jueves a las 00:00 (12:00 AM) se cierra la posibilidad de reservar para la semana siguiente. Los huecos que no estén completos o no tengan pacientes asignados se liberarán automáticamente el jueves a las 00:00, quedando disponibles para otros profesionales.

El objetivo de este sistema es mejorar la previsibilidad y aprovechar al máximo la disponibilidad de quirófanos, facilitando la coordinación entre los equipos quirúrgicos, anestesia y hospitalización.

Si finalmente no tiene previsto utilizar esos huecos, no es necesario realizar ninguna acción, ya que el sistema los liberará automáticamente tras el cierre de la programación.

Muchas gracias por su colaboración.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getRecordatorioMiercolesSubject(): string {
  return ASUNTO_RECORDATORIO;
}

export function getRecordatorioMiercolesBody(apellido: string): string {
  return CUERPO_RECORDATORIO(apellido);
}

/** Apellido del usuario (última palabra del nombre, ej. "Dra. María García" → "García") */
export function getApellidoFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name || "Dr./Dra.";
}

// --- Paciente no apto en consulta de preanestesia (aviso al cirujano) ---
const ASUNTO_NO_APTO = "Paciente no apto en consulta de preanestesia";

const CUERPO_NO_APTO = (apellido: string) => `Estimado/a Dr./Dra. ${apellido},

Le informamos de que el paciente programado para su intervención ha sido valorado en consulta de preanestesia y, en el momento actual, no ha sido considerado apto para la intervención quirúrgica.

En consecuencia, el caso ha sido retirado temporalmente de la programación quirúrgica hasta que la situación clínica del paciente permita reconsiderar la intervención.

El hueco quirúrgico correspondiente ha quedado liberado en la agenda del bloque y podrá ser utilizado para programar otros pacientes si lo considera oportuno.

Si necesita más información o desea comentar el caso, puede ponerse en contacto con la coordinación del bloque quirúrgico a través de la aplicación en la sección "Contactar al gestor".

Muchas gracias por su colaboración.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera`;

export function getPacienteNoAptoSubject(): string {
  return ASUNTO_NO_APTO;
}

export function getPacienteNoAptoBody(apellido: string): string {
  return CUERPO_NO_APTO(apellido);
}
