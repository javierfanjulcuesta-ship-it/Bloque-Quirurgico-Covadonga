/**
 * Clasificación automática de correos entrantes.
 * Distingue: reserva de quirófano, mensaje general, solicitud de acceso, desconocido.
 */

import type { InboxMessage } from "./types";
import type { EmailClassification } from "./types";

const RESERVATION_KEYWORDS = [
  "reserva",
  "reservar",
  "quirófano",
  "quirofano",
  "programar",
  "bloque",
  "hueco",
  "Q1",
  "Q2",
  "Q3",
  "procedimientos menores",
  "técnicas del dolor",
  "mañana",
  "tarde",
  "slot",
  "paciente",
  "pacientes",
  "procedimiento",
  "intervención",
  "intervencion",
];

const ACCESS_REQUEST_KEYWORDS = [
  "acceso",
  "alta",
  "usuario",
  "contraseña",
  "contrasena",
  "invitación",
  "invitacion",
  "registro",
  "solicitud de acceso",
  "dar de alta",
  "nuevo usuario",
  "crear cuenta",
];

const GENERAL_KEYWORDS = [
  "duda",
  "dudas",
  "incidencia",
  "incidencias",
  "consulta",
  "coordinación",
  "coordinacion",
  "cambio",
  "modificación",
  "modificacion",
  "cancelar",
  "anular",
];

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function hasStructuredReservationFormat(text: string): boolean {
  const normalized = normalizeForSearch(text);
  // Formato típico: Fecha / Quirófano / Turno / Pacientes
  const hasDate = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(text);
  const hasResource = /Q[123]|procedimientos|tecnicas|menores|dolor/i.test(text);
  const hasShift = /mañana|manana|tarde|morning|afternoon/i.test(text);
  const hasPatientRef = /paciente|historia|HC|nº?\s*historia|numero\s*historia/i.test(text);
  return (hasDate && hasResource) || (hasResource && hasPatientRef) || (hasDate && hasShift && hasResource);
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const normalized = normalizeForSearch(text);
  return keywords.filter((kw) => normalized.includes(normalizeForSearch(kw))).length;
}

/**
 * Clasifica un correo entrante en: reservation | general | access_request | unknown
 */
export function classifyIncomingEmail(message: InboxMessage): EmailClassification {
  const subject = message.subject ?? "";
  const body = message.bodyPlain ?? "";
  const combined = `${subject} ${body}`;

  const reservationScore = countKeywordMatches(combined, RESERVATION_KEYWORDS);
  const accessScore = countKeywordMatches(combined, ACCESS_REQUEST_KEYWORDS);
  const generalScore = countKeywordMatches(combined, GENERAL_KEYWORDS);

  // Formato estructurado de reserva tiene prioridad
  if (hasStructuredReservationFormat(combined) || reservationScore >= 3) {
    return "reservation";
  }

  if (accessScore >= 2 || (accessScore >= 1 && (reservationScore === 0 && generalScore === 0))) {
    return "access_request";
  }

  if (reservationScore >= 1 && reservationScore >= generalScore) {
    return "reservation";
  }

  if (generalScore >= 1 || accessScore >= 1) {
    return "general";
  }

  if (reservationScore >= 1) {
    return "reservation";
  }

  return "unknown";
}
