/**
 * Parser de correos de reserva de quirófano.
 * Acepta variantes realistas de formato.
 * Devuelve errores claros si faltan campos obligatorios.
 */

import type { ParsedReservationEmail } from "./types";

export type ParseReservationResult =
  | { ok: true; data: ParsedReservationEmail }
  | { ok: false; error: string; missingFields?: string[] };

// --- Fecha ---
function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

// --- Recurso: Quirófano / Quirofano / Recurso / Q1, Q2, Q3, procedimientos menores, técnicas dolor ---
function parseResourceId(text: string): string | null {
  const upper = text.toUpperCase();
  if (/\bQ1\b/.test(upper) || /quir[oó]fano\s*1|recurso\s*Q1/i.test(text)) return "Q1";
  if (/\bQ2\b/.test(upper) || /quir[oó]fano\s*2|recurso\s*Q2/i.test(text)) return "Q2";
  if (/\bQ3\b/.test(upper) || /quir[oó]fano\s*3|recurso\s*Q3/i.test(text)) return "Q3";
  if (/procedimientos?\s*menores|menores/i.test(text)) return "procedimientos-menores";
  if (/tecnicas?\s*(del)?\s*dolor|dolor/i.test(text)) return "tecnicas-dolor";
  return null;
}

// --- Turno: mañana / afternoon / morning / tarde / am / pm / matutino / vespertino ---
function parseShift(text: string): "morning" | "afternoon" | null {
  const lower = text.toLowerCase();
  if (/mañana|manana|morning|am\b|matutino|turno\s*:\s*mañana/i.test(lower)) return "morning";
  if (/tarde|afternoon|pm\b|vespertino|turno\s*:\s*tarde/i.test(lower)) return "afternoon";
  return null;
}

// --- Slot / Tramo / tramo ---
function parseSlotIndex(text: string): number {
  const patterns = [
    /slot\s*[:\s]*(\d+)/i,
    /tramo\s*[:\s]*(\d+)/i,
    /(\d+)\s*º?\s*slot/i,
    /slot\s*(\d+)/i,
    /tramo\s*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const idx = parseInt(m[1] ?? "0", 10);
      return Math.max(0, Math.min(idx, 5));
    }
  }
  return 0;
}

// --- Pacientes: HC-xxx, historia, nº hist, procedure, X min, anesthesia, entidad ---
const ANESTHESIA_OPTIONS = ["local", "regional", "general", "sedación", "sedacion"];
const INSURANCE_OPTIONS = ["sns", "privado", "mutua", "sis"];

function parsePatients(text: string): ParsedReservationEmail["patients"] {
  const patients: NonNullable<ParsedReservationEmail["patients"]> = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const historyMatch = trimmed.match(/(?:HC[:\-]?|historia\s*[:\-]?|nº?\s*hist\.?|numero\s*historia)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i)
      ?? trimmed.match(/^[\-\*]?\s*(HC[\-]?[A-Za-z0-9\-]+)/i);
    if (!historyMatch) continue;

    const numeroHistoria = historyMatch[1]!.trim();
    const procedureMatch = trimmed.match(/procedimiento\s*[:\-]?\s*(.+?)(?:\s*\|\s*|\s+(\d+)\s*min|$)/i)
      ?? trimmed.match(/([^,]+),\s*(\d+)\s*min/i)
      ?? trimmed.match(/(.+?)\s+(\d+)\s*min/i);
    const procedure = procedureMatch?.[1]?.trim() ?? "Procedimiento";
    const durationStr = procedureMatch?.[2] ?? trimmed.match(/(\d+)\s*min/i)?.[1];
    const estimatedDurationMinutes = Math.max(1, parseInt(durationStr ?? "60", 10) || 60);

    let anesthesiaType = "General";
    for (const a of ANESTHESIA_OPTIONS) {
      if (new RegExp(`\\b${a}\\b`, "i").test(trimmed)) {
        anesthesiaType = a.charAt(0).toUpperCase() + a.slice(1);
        break;
      }
    }

    let entidadFinanciadora = "SNS";
    for (const ins of INSURANCE_OPTIONS) {
      if (new RegExp(`\\b${ins}\\b`, "i").test(trimmed)) {
        entidadFinanciadora = ins === "sns" ? "SNS" : ins.charAt(0).toUpperCase() + ins.slice(1);
        break;
      }
    }

    const nameMatch = trimmed.match(/(?:HC[^,]*|historia[^,]*)[,\s]+([A-Za-záéíóúñ\s]+?)(?:,\s|$|\d)/i);
    const name = nameMatch?.[1]?.trim();

    const admissionType = /\bingreso\b/i.test(trimmed) ? "ingreso" as const : "ambulatorio" as const;

    patients.push({
      numeroHistoria,
      name,
      procedure,
      estimatedDurationMinutes,
      anesthesiaType,
      entidadFinanciadora,
      admissionType,
    });
  }

  return patients.length > 0 ? patients : undefined;
}

/**
 * Parsea correo de reserva. Devuelve resultado con datos o error con campos faltantes.
 */
export function parseReservationEmail(message: { subject: string; bodyPlain: string }): ParseReservationResult {
  const text = `${message.subject}\n${message.bodyPlain}`;
  const missingFields: string[] = [];

  const date = parseDate(text);
  if (!date) missingFields.push("Fecha (formato YYYY-MM-DD o DD/MM/YYYY)");

  const resourceId = parseResourceId(text);
  if (!resourceId) missingFields.push("Quirófano/Recurso (Q1, Q2, Q3, procedimientos menores o técnicas del dolor)");

  const shift = parseShift(text);
  if (!shift) missingFields.push("Turno (mañana/morning o tarde/afternoon)");

  if (missingFields.length > 0) {
    return {
      ok: false,
      error: `Faltan campos obligatorios: ${missingFields.join("; ")}`,
      missingFields,
    };
  }

  const slotIndex = parseSlotIndex(text);
  const patients = parsePatients(text);

  if (patients) {
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i]!;
      if (p.estimatedDurationMinutes <= 0) {
        return {
          ok: false,
          error: `Paciente ${i + 1} (${p.numeroHistoria}): duración estimada debe ser > 0`,
          missingFields: ["estimatedDurationMinutes"],
        };
      }
    }
  }

  return {
    ok: true,
    data: {
      date: date!,
      resourceId: resourceId!,
      shift: shift!,
      slotIndex,
      patients,
      rawText: text.slice(0, 500),
    },
  };
}
