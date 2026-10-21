import { createHmac } from "node:crypto";
import * as XLSX from "xlsx";
import { getSlots } from "@/lib/utils";
import { suggestSurgeonHabit, TURNO_INFERIDO, QUIROFANO_INFERIDO } from "@/lib/surgeons/habits";
import { buildProgramAlerts } from "@/lib/program/programAlerts";
import { renderParte } from "@/lib/drafts/parteTemplate";

export const MASTER_SHEETS = ["1_PROGRAMA", "DATOS_IQ"] as const;
export const FUENTE_INCOMPLETA = "FUENTE_INCOMPLETA";
export const NOMBRE_DIVERGENTE = "NOMBRE_DIVERGENTE";

const IDENTITY_HEADERS = ["historia", "nhc", "numhistoria", "nhistoria", "numerohistoria"];
const NAME_HEADERS = ["nombre", "paciente"];
const PROCEDURE_HEADERS = ["procedimiento", "intervencion", "iq"];
const DATE_HEADERS = ["fecha"];
const SHIFT_HEADERS = ["turno"];
const RESOURCE_HEADERS = ["quirofano", "sala", "recurso"];
const SURGEON_HEADERS = ["cirujano"];
const MINUTE_HEADERS = ["minutos", "duracion"];
const CLOCK_HEADERS = ["hora", "inicio"];
const REJECTED_HEADERS = ["dni", "nie", "nif"];

export function normalizeIntakeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function intakeDedupKey(historyNumber: string, serviceDate: string, procedure: string): string {
  return `${normalizeIntakeText(historyNumber)}|${serviceDate}|${normalizeIntakeText(procedure)}`;
}

export interface ParsedIntakeRow {
  sheetName: (typeof MASTER_SHEETS)[number];
  historyNumber: string;
  patientName: string;
  procedure: string;
  serviceDate: string;
  shift: "morning" | "afternoon" | null;
  resourceId: string | null;
  slotIndex: number | null;
  surgeonName: string | null;
  minutes: number;
  flags: string[];
  suggestedShift: "morning" | "afternoon" | null;
  suggestedResourceId: string | null;
}

export type ParseMasterResult =
  | { ok: false; error: "dni_column" | "missing_sheets" | "empty" }
  | { ok: true; rows: ParsedIntakeRow[] };

function headerToken(value: unknown): string {
  return normalizeIntakeText(String(value ?? "")).replace(/ /g, "");
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

function parseShift(value: unknown): "morning" | "afternoon" | null {
  const text = normalizeIntakeText(String(value ?? ""));
  if (!text) return null;
  if (text.includes("tarde") || text === "afternoon" || text === "pm") return "afternoon";
  if (text.includes("manana") || text === "morning" || text === "am") return "morning";
  return null;
}

function parseResource(value: unknown): string | null {
  const text = normalizeIntakeText(String(value ?? ""));
  if (!text) return null;
  if (/\bq ?1\b/.test(text) || text === "q1") return "Q1";
  if (/\bq ?2\b/.test(text) || text === "q2") return "Q2";
  if (/\bq ?3\b/.test(text) || text === "q3") return "Q3";
  if (text.includes("endoscop") || text === "endo") return "ENDO";
  if (text.includes("menor")) return "procedimientos-menores";
  if (text.includes("dolor")) return "tecnicas-dolor";
  return null;
}

function parseClock(value: unknown): string | null {
  if (typeof value === "number" && value >= 0 && value < 1) {
    const total = Math.round(value * 24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function slotFor(shift: "morning" | "afternoon" | null, clock: string | null): number | null {
  if (!shift || !clock) return null;
  const index = getSlots(shift).findIndex((slot) => slot.start === clock);
  return index >= 0 ? index : null;
}

function parseSheet(sheetName: (typeof MASTER_SHEETS)[number], sheet: XLSX.WorkSheet): ParsedIntakeRow[] | "dni_column" {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true, defval: "" });
  const headerIndex = rows.findIndex((row) => row.some((cell) => IDENTITY_HEADERS.includes(headerToken(cell))));
  if (headerIndex < 0) return [];
  const headers = (rows[headerIndex] ?? []).map(headerToken);
  const headerWords = (rows[headerIndex] ?? []).flatMap((cell) => normalizeIntakeText(String(cell ?? "")).split(" "));
  if (headerWords.some((word) => REJECTED_HEADERS.includes(word))) return "dni_column";
  const columns = {
    history: findColumn(headers, IDENTITY_HEADERS),
    name: findColumn(headers, NAME_HEADERS),
    procedure: findColumn(headers, PROCEDURE_HEADERS),
    date: findColumn(headers, DATE_HEADERS),
    shift: findColumn(headers, SHIFT_HEADERS),
    resource: findColumn(headers, RESOURCE_HEADERS),
    surgeon: findColumn(headers, SURGEON_HEADERS),
    minutes: findColumn(headers, MINUTE_HEADERS),
    clock: findColumn(headers, CLOCK_HEADERS),
  };
  if (columns.history < 0 || columns.name < 0 || columns.procedure < 0 || columns.date < 0) return [];

  const parsed: ParsedIntakeRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const historyNumber = String(row[columns.history] ?? "").trim();
    const patientName = String(row[columns.name] ?? "").trim();
    const procedure = String(row[columns.procedure] ?? "").trim();
    const serviceDate = parseDate(row[columns.date]);
    if (!historyNumber || !patientName || !procedure || !serviceDate) continue;
    const explicitShift = columns.shift >= 0 ? parseShift(row[columns.shift]) : null;
    const explicitResource = columns.resource >= 0 ? parseResource(row[columns.resource]) : null;
    const surgeonName = columns.surgeon >= 0 ? String(row[columns.surgeon] ?? "").trim() || null : null;
    const suggestion = suggestSurgeonHabit({
      explicitShift,
      explicitResourceId: explicitResource,
      surgeonName,
    });
    const flags = suggestion.flags.filter((flag) => flag === TURNO_INFERIDO || flag === QUIROFANO_INFERIDO);
    const minutesRaw = columns.minutes >= 0 ? Number(row[columns.minutes]) : 60;
    const clock = columns.clock >= 0 ? parseClock(row[columns.clock]) : null;
    parsed.push({
      sheetName,
      historyNumber,
      patientName,
      procedure,
      serviceDate,
      shift: explicitShift,
      resourceId: explicitResource,
      slotIndex: slotFor(explicitShift, clock),
      surgeonName,
      minutes: Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.round(minutesRaw) : 60,
      flags: [...flags],
      suggestedShift: flags.includes(TURNO_INFERIDO) ? suggestion.shift : null,
      suggestedResourceId: flags.includes(QUIROFANO_INFERIDO) ? suggestion.resourceId : null,
    });
  }
  return parsed;
}

export function parseMasterWorkbook(bytes: Buffer | Uint8Array): ParseMasterResult {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const present = MASTER_SHEETS.filter((name) => workbook.SheetNames.includes(name));
  if (present.length === 0) return { ok: false, error: "missing_sheets" };
  const rows: ParsedIntakeRow[] = [];
  for (const name of present) {
    const parsed = parseSheet(name, workbook.Sheets[name]!);
    if (parsed === "dni_column") return { ok: false, error: "dni_column" };
    rows.push(...parsed);
  }
  if (rows.length === 0) return { ok: false, error: "empty" };
  return { ok: true, rows };
}

export function intakeHmac(salt: string, value: string): string {
  return createHmac("sha256", salt).update(value).digest("hex");
}

export interface StoredFingerprint {
  serviceDate: string;
  caseFingerprint: string;
  historyFingerprint: string;
  nameFingerprint: string;
}

export interface PublicReviewRow {
  rowNumber: number;
  sheetName: (typeof MASTER_SHEETS)[number];
  serviceDate: string;
  shift: "morning" | "afternoon" | null;
  resourceId: string | null;
  slotIndex: number | null;
  surgeonName: string | null;
  procedure: string;
  minutes: number;
  status: "REVIEW" | "NOMBRE_DIVERGENTE" | "DUPLICATE";
  flags: string[];
  suggestedShift: "morning" | "afternoon" | null;
  suggestedResourceId: string | null;
}

export interface MasterReview {
  batchStatus: "REVIEW" | "FUENTE_INCOMPLETA";
  missingCount: number;
  publicRows: PublicReviewRow[];
  parte: string;
  alerts: ReturnType<typeof buildProgramAlerts>["alerts"];
  fingerprints: StoredFingerprint[];
}

/** Revisa el fichero en memoria. Lo que se puede guardar son solo huellas HMAC, nunca el texto. */
export function reviewMasterImport(input: {
  salt: string;
  existing: StoredFingerprint[];
  incoming: ParsedIntakeRow[];
}): MasterReview {
  const printed = input.incoming.map((row, index) => {
    const history = normalizeIntakeText(row.historyNumber);
    const name = normalizeIntakeText(row.patientName);
    const material = `${history}|${row.serviceDate}|${normalizeIntakeText(row.procedure)}`;
    return {
      row,
      rowNumber: index + 1,
      caseFingerprint: intakeHmac(input.salt, material),
      historyFingerprint: intakeHmac(input.salt, history),
      nameFingerprint: intakeHmac(input.salt, name),
    };
  });
  const dates = new Set(printed.map((item) => item.row.serviceDate));
  const existingCases = new Set(
    input.existing.filter((item) => dates.has(item.serviceDate)).map((item) => item.caseFingerprint),
  );
  const incomingCases = new Set(printed.map((item) => item.caseFingerprint));
  const missingCount = [...existingCases].filter((item) => !incomingCases.has(item)).length;
  const nameByHistory = new Map<string, string>();
  for (const item of input.existing) {
    if (!nameByHistory.has(item.historyFingerprint)) nameByHistory.set(item.historyFingerprint, item.nameFingerprint);
  }

  const seen = new Set<string>();
  const publicRows: PublicReviewRow[] = [];
  const fingerprints: StoredFingerprint[] = [];
  const parteCases = [];
  for (const item of printed) {
    const flags = [...item.row.flags];
    let status: PublicReviewRow["status"] = "REVIEW";
    const knownName = nameByHistory.get(item.historyFingerprint);
    if (seen.has(item.caseFingerprint) || existingCases.has(item.caseFingerprint)) {
      status = "DUPLICATE";
    } else {
      seen.add(item.caseFingerprint);
      if (knownName && knownName !== item.nameFingerprint) {
        status = "NOMBRE_DIVERGENTE";
        flags.push(NOMBRE_DIVERGENTE);
      } else if (!knownName) {
        nameByHistory.set(item.historyFingerprint, item.nameFingerprint);
      }
      fingerprints.push({
        serviceDate: item.row.serviceDate,
        caseFingerprint: item.caseFingerprint,
        historyFingerprint: item.historyFingerprint,
        nameFingerprint: knownName ?? item.nameFingerprint,
      });
    }
    publicRows.push({
      rowNumber: item.rowNumber,
      sheetName: item.row.sheetName,
      serviceDate: item.row.serviceDate,
      shift: item.row.shift,
      resourceId: item.row.resourceId,
      slotIndex: item.row.slotIndex,
      surgeonName: item.row.surgeonName,
      procedure: item.row.procedure,
      minutes: item.row.minutes,
      status,
      flags,
      suggestedShift: item.row.suggestedShift,
      suggestedResourceId: item.row.suggestedResourceId,
    });
    if (item.row.shift && item.row.slotIndex != null && status !== "DUPLICATE") {
      parteCases.push({
        date: item.row.serviceDate,
        shift: item.row.shift,
        slotIndex: item.row.slotIndex,
        fullName: item.row.patientName,
        procedure: item.row.procedure,
      });
    }
  }

  const alerts = buildProgramAlerts({
    reservations: publicRows.filter((row) => row.status !== "DUPLICATE").map((row) => ({
      id: `fila-${row.rowNumber}`,
      date: row.serviceDate,
      resourceId: row.resourceId,
      shift: row.shift ?? "morning",
      slotIndex: row.slotIndex ?? 0,
      surgeonId: row.surgeonName ?? "sin-cirujano",
      status: "confirmed",
      patients: [{
        numeroHistoria: `FILA-${row.rowNumber}`,
        procedure: row.procedure,
        estimatedDurationMinutes: row.minutes,
      }],
    })),
  }).alerts;

  return {
    batchStatus: missingCount > 0 ? "FUENTE_INCOMPLETA" : "REVIEW",
    missingCount,
    publicRows,
    parte: renderParte(parteCases).body,
    alerts,
    fingerprints,
  };
}

export function matchSurgeon(
  surgeonName: string,
  users: Array<{ id: string; name: string }>,
): { ok: true; userId: string } | { ok: false; reason: "none" | "ambiguous" } {
  const wanted = normalizeIntakeText(surgeonName);
  const exact = users.filter((user) => normalizeIntakeText(user.name) === wanted);
  if (exact.length === 1) return { ok: true, userId: exact[0]!.id };
  if (exact.length > 1) return { ok: false, reason: "ambiguous" };
  const tokens = wanted.split(" ").filter((token) => token.length > 3);
  const surname = tokens.at(-1);
  if (!surname) return { ok: false, reason: "none" };
  const bySurname = users.filter((user) => normalizeIntakeText(user.name).split(" ").includes(surname));
  if (bySurname.length === 1) return { ok: true, userId: bySurname[0]!.id };
  if (bySurname.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: false, reason: "none" };
}
