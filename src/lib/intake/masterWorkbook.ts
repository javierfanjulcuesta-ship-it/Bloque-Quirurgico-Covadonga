import * as XLSX from "xlsx";
import { getSlots } from "@/lib/utils";
import { recognizeResourceId } from "@/lib/program/recognizeResource";
import { suggestSurgeonHabit, TURNO_INFERIDO, QUIROFANO_INFERIDO } from "@/lib/surgeons/habits";

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
  if (text.includes("endoscop")) return "endoscopias";
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

export interface ExistingIntakeRow {
  dedupKey: string;
  historyNumber: string;
  patientName: string;
  serviceDate: string;
}

export interface KnownIdentity {
  historyNumber: string;
  displayName: string;
}

export interface PlannedIntakeRow extends ParsedIntakeRow {
  dedupKey: string;
  status: "PENDING" | "NOMBRE_DIVERGENTE";
}

export interface IntakePlan {
  batchStatus: "REVIEW" | "FUENTE_INCOMPLETA";
  missingKeys: string[];
  rowsToInsert: PlannedIntakeRow[];
  identityCreates: Array<{ historyNumber: string; displayName: string }>;
}

export function planMasterImport(input: {
  existing: ExistingIntakeRow[];
  identities: KnownIdentity[];
  incoming: ParsedIntakeRow[];
}): IntakePlan {
  const dates = new Set(input.incoming.map((row) => row.serviceDate));
  const existingInScope = input.existing.filter((row) => dates.has(row.serviceDate));
  const existingKeys = new Set(existingInScope.map((row) => row.dedupKey));
  const incomingKeys = new Set(input.incoming.map((row) => intakeDedupKey(row.historyNumber, row.serviceDate, row.procedure)));
  const missingKeys = [...existingKeys].filter((key) => !incomingKeys.has(key)).sort();
  const namesByHistory = new Map<string, string>();
  for (const identity of input.identities) {
    namesByHistory.set(normalizeIntakeText(identity.historyNumber), normalizeIntakeText(identity.displayName));
  }
  for (const row of input.existing) {
    const key = normalizeIntakeText(row.historyNumber);
    if (!namesByHistory.has(key)) namesByHistory.set(key, normalizeIntakeText(row.patientName));
  }

  const seen = new Set<string>();
  const rowsToInsert: PlannedIntakeRow[] = [];
  const identityCreates: Array<{ historyNumber: string; displayName: string }> = [];
  for (const row of input.incoming) {
    const dedupKey = intakeDedupKey(row.historyNumber, row.serviceDate, row.procedure);
    if (seen.has(dedupKey) || existingKeys.has(dedupKey)) continue;
    seen.add(dedupKey);
    const historyKey = normalizeIntakeText(row.historyNumber);
    const knownName = namesByHistory.get(historyKey);
    const normalizedName = normalizeIntakeText(row.patientName);
    const divergent = Boolean(knownName && knownName !== normalizedName);
    if (divergent) {
      rowsToInsert.push({
        ...row,
        dedupKey,
        status: "NOMBRE_DIVERGENTE",
        flags: [...row.flags, NOMBRE_DIVERGENTE],
      });
      continue;
    }
    if (!knownName) {
      namesByHistory.set(historyKey, normalizedName);
      identityCreates.push({ historyNumber: row.historyNumber.trim(), displayName: row.patientName.trim() });
    }
    rowsToInsert.push({ ...row, dedupKey, status: "PENDING" });
  }

  return {
    batchStatus: missingKeys.length > 0 ? "FUENTE_INCOMPLETA" : "REVIEW",
    missingKeys,
    rowsToInsert,
    identityCreates,
  };
}

export function canApproveIntakeRow(row: {
  status: string;
  flags: string;
  shift: string | null;
  resourceId: string | null;
  slotIndex: number | null;
  surgeonName: string | null;
}): boolean {
  if (row.status !== "PENDING") return false;
  const flags = row.flags.split(",").map((flag) => flag.trim()).filter(Boolean);
  if (flags.some((flag) => flag === NOMBRE_DIVERGENTE || flag === TURNO_INFERIDO || flag === QUIROFANO_INFERIDO || flag === FUENTE_INCOMPLETA)) {
    return false;
  }
  if (row.shift !== "morning" && row.shift !== "afternoon") return false;
  if (!recognizeResourceId(row.resourceId)) return false;
  if (row.slotIndex == null || !Number.isInteger(row.slotIndex)) return false;
  return Boolean(row.surgeonName?.trim());
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
