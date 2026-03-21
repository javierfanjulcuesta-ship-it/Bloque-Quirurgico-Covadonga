/**
 * Tipos para el servicio de correo Outlook / Microsoft 365
 */

export type EmailClassification = "reservation" | "general" | "access_request" | "unknown";

/** Mensaje de correo entrante (normalizado desde Outlook o mock) */
export interface InboxMessage {
  id: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
  receivedAt: string; // ISO
}

/** Resultado del parser de correo de reserva */
export interface ParsedReservationEmail {
  date: string; // YYYY-MM-DD
  resourceId: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
  patients?: Array<{
    numeroHistoria: string;
    name?: string;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    entidadFinanciadora: string;
    admissionType?: "ingreso" | "ambulatorio";
    notes?: string;
  }>;
  rawText?: string;
}
