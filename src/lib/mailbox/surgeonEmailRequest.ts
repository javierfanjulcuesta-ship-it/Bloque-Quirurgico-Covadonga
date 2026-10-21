/**
 * Resumen estructurado de una solicitud de cirujano.
 * No copia el cuerpo ni historia, nombre, teléfono o email de paciente.
 */

export interface SurgeonEmailRequest {
  surgeonName: string | null;
  procedure: string | null;
  date: string | null;
  shift: "morning" | "afternoon" | null;
  durationMinutes: number | null;
  insurance: string | null;
  specialMaterial: string | null;
  missing: string[];
}

export interface SurgeonProposalPlan {
  weekStart: string;
  type: "SURGEON_EMAIL";
  status: "PENDING";
  summary: string;
  payload: {
    surgeonName: string | null;
    procedure: string | null;
    date: string | null;
    shift: "morning" | "afternoon" | null;
    durationMinutes: number | null;
    insurance: string | null;
    specialMaterial: string | null;
    missing: string[];
    caseLabel: "Caso 1";
  };
}

function isCalendarDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
  let candidate: string | null = null;
  if (iso) candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (dmy) candidate = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return candidate && isCalendarDate(candidate) ? candidate : null;
}

function parseShift(text: string): "morning" | "afternoon" | null {
  if (/\b(mañana|manana|morning)\b/i.test(text)) return "morning";
  if (/\b(tarde|afternoon)\b/i.test(text)) return "afternoon";
  return null;
}

function cleanProcedure(value: string): string | null {
  const cleaned = value
    .replace(/\bHC[-A-Z0-9]+\b/gi, " ")
    .replace(/\bTEST-\d+\b/gi, " ")
    .replace(/paciente\s+prueba\s+\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function parseSurgeonEmailRequest(input: {
  subject?: string | null;
  bodyPlain?: string | null;
  fromName?: string | null;
}): SurgeonEmailRequest {
  const text = `${input.subject ?? ""}\n${input.bodyPlain ?? ""}`;
  const surgeonLine = text.match(/\bcirujano\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const fromName = input.fromName?.trim() || null;
  const surgeonName = surgeonLine || (fromName && !fromName.includes("@") ? fromName : null);
  const procedure = cleanProcedure(text.match(/\bprocedimiento\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? "");
  const date = parseDate(text);
  const shift = parseShift(text);
  const durationMatch = text.match(/\b(\d{1,3})\s*min\b/i);
  const durationMinutes = durationMatch ? Number(durationMatch[1]) : null;
  let insurance: string | null = null;
  if (/\bsespa\b/i.test(text)) insurance = "SESPA";
  else if (/\bsns\b/i.test(text)) insurance = "SNS";
  else if (/\bmutua\b/i.test(text)) insurance = "Mutua";
  else if (/\bprivado\b/i.test(text)) insurance = "Privado";
  const materialRaw = text.match(/\b(?:material|pr[oó]tesis)\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
  const specialMaterial = materialRaw ? cleanProcedure(materialRaw) : null;
  const missing: string[] = [];
  if (!surgeonName) missing.push("Cirujano");
  if (!procedure) missing.push("Procedimiento");
  if (!date) missing.push("Fecha");
  if (!shift) missing.push("Turno");
  if (!durationMinutes || durationMinutes <= 0) missing.push("Duración");
  if (!insurance) missing.push("Seguro");
  return {
    surgeonName,
    procedure,
    date,
    shift,
    durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
    insurance,
    specialMaterial,
    missing,
  };
}

export function planSurgeonEmailProposal(
  input: {
    subject?: string | null;
    bodyPlain?: string | null;
    fromName?: string | null;
  },
  receivedOn: string,
): SurgeonProposalPlan {
  const request = parseSurgeonEmailRequest(input);
  const weekStart = request.date ?? receivedOn.slice(0, 10);
  const shiftLabel = request.shift === "afternoon" ? "tarde" : request.shift === "morning" ? "mañana" : "turno pendiente";
  const summary = `${request.surgeonName ?? "Cirujano"} · ${request.procedure ?? "procedimiento pendiente"} · ${request.date ?? "fecha pendiente"} · ${shiftLabel}`.slice(0, 240);
  return {
    weekStart,
    type: "SURGEON_EMAIL",
    status: "PENDING",
    summary,
    payload: {
      surgeonName: request.surgeonName,
      procedure: request.procedure,
      date: request.date,
      shift: request.shift,
      durationMinutes: request.durationMinutes,
      insurance: request.insurance,
      specialMaterial: request.specialMaterial,
      missing: request.missing,
      caseLabel: "Caso 1",
    },
  };
}
