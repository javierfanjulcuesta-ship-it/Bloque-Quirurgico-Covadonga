"use client";

/**
 * Modal para añadir pacientes a una reserva. Valida que el tiempo total (procedimiento + 10 min por paciente) no exceda el tiempo reservado.
 */

import { useState, useMemo } from "react";
import type { PatientInBlock, AdmissionType, SolicitudRecursosId } from "@/lib/types";
import {
  TRANSITION_MINUTES_PER_PROCEDURE,
  SOLICITUD_RECURSOS_OPTIONS,
  LARGE_BLOCK_REMAINDER_MINUTES,
} from "@/lib/constants";
import { resolveTitularSchedulerForm } from "@/lib/surgeonTitular";
import type { Shift } from "@/lib/types";
import { getUsers } from "@/lib/dataHelpers";
import { hasGestorAccess, type UserRole } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineNotice } from "@/components/ui/InlineNotice";

export interface SlotSelection {
  date: string;
  resourceId: string;
  shift: Shift;
  slotIndex: number;
  durationMinutes: number;
}

function totalReservedMinutes(slots: SlotSelection[]): number {
  return slots.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export interface ProgramarPacientesModalProps {
  slots: SlotSelection[];
  /** Rol del usuario que abre el modal (gestor / gestor-anestesista → cirujano responsable obligatorio). */
  schedulerRole?: UserRole | string;
  /** Nombre visible del cirujano en sesión (titular interno del hueco cuando no es gestor). */
  schedulerSelfDisplayName?: string;
  onSave: (
    patients: Omit<PatientInBlock, "id" | "order">[],
    meta?: { responsibleSurgeonId: string; externalSurgeonName?: string }
  ) => void | Promise<void>;
  onClose: () => void;
  /** Si true, deshabilita el botón guardar (ej. mientras se guarda en API) */
  saving?: boolean;
}

const ANESTHESIA_OPTIONS = ["Local", "Regional", "General", "Sedación"];

/** Fila con mínimo obligatorio para contar tiempo frente al bloque reservado. */
function rowHasRequiredCore(p: Partial<PatientInBlock>): boolean {
  return !!(p.numeroHistoria?.trim() && p.procedure?.trim() && p.entidadFinanciadora?.trim());
}

/** Minutos por fila para totales del modal: si faltan datos core no cuenta; si falta duración, asume 60 min (provisional). */
function rowMinutesForQuota(p: Partial<PatientInBlock>): number {
  if (!rowHasRequiredCore(p)) return 0;
  const m = p.estimatedDurationMinutes;
  if (typeof m === "number" && Number.isFinite(m) && m > 0) return m + TRANSITION_MINUTES_PER_PROCEDURE;
  return 60 + TRANSITION_MINUTES_PER_PROCEDURE;
}

function programmingTotalMinutes(patients: Partial<PatientInBlock>[]): number {
  return patients.reduce((s, p) => s + rowMinutesForQuota(p), 0);
}

interface QuickParseResult {
  parsedPatients: Partial<PatientInBlock>[];
  parseMode: "empty" | "heuristic" | "structured-medical";
  detectedSurgeonId?: string;
  detectedSurgeonName?: string;
  /** Titular extraído de línea Dr./Dra. cuando no hay usuario en directorio (p. ej. "Dr Pérez"). */
  externalSurgeonName?: string;
  /** @deprecated usar externalSurgeonName; se mantiene para mensajes legacy. */
  titularFreeLine?: string;
  detectedProcedureCount: number;
  detectedFundingLabels: string[];
  recognizedAbbreviations: string[];
  normalizedTerms: string[];
  noiseRemovedCount: number;
}

function normalizeLower(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FUNDING_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "SESPA", patterns: [/\bsespa\b/i, /\bsergas\b/i, /\bsas\b/i, /\bpublic[oa]?\b/i] },
  { label: "Privado", patterns: [/\bprivad[oa]s?\b/i, /\bprivate\b/i] },
  { label: "Mutua", patterns: [/\bmutua(?:s)?\b/i, /\bmutual\b/i, /\bfremap\b/i, /\bmapfre\b/i, /\baxa\b/i, /\badeslas\b/i, /\basisa\b/i, /\bdkv\b/i] },
];

const PROCEDURE_ABBREVIATIONS: Array<{ pattern: RegExp; token: string; normalized: string; confident: boolean }> = [
  { pattern: /\bprp\b/gi, token: "PRP", normalized: "PRP", confident: true },
  { pattern: /\bholep\b/gi, token: "HOLEP", normalized: "HOLEP", confident: true },
  { pattern: /\bfacos?\b/gi, token: "FACO/FACOS", normalized: "Facoemulsificación", confident: true },
  { pattern: /\blca\b/gi, token: "LCA", normalized: "Lesión/rotura LCA", confident: true },
  { pattern: /\bptr\b/gi, token: "PTR", normalized: "PTR", confident: true },
  { pattern: /\bptc\b/gi, token: "PTC", normalized: "PTC", confident: true },
  { pattern: /\bfx\b/gi, token: "Fx", normalized: "Fractura", confident: true },
  { pattern: /\bmc\b/gi, token: "MC", normalized: "MC (revisar)", confident: false },
  { pattern: /\bcar\b/gi, token: "CAR", normalized: "CAR (revisar)", confident: false },
  { pattern: /\bcah\b/gi, token: "CAH", normalized: "CAH (revisar)", confident: false },
];

const NOISE_PATTERNS: RegExp[] = [
  /\bpte(?:\s+parte)?\b/gi,
  /\bconfirmad[oa]s?\b/gi,
  /\bpendiente(?:s)?\b/gi,
  /\bbloque\b/gi,
];

function detectFundingFromText(text: string): string {
  for (const f of FUNDING_PATTERNS) {
    if (f.patterns.some((p) => p.test(text))) return f.label;
  }
  return "";
}

/** Entidad para formulario: etiqueta conocida (Mutua, Privado, SESPA) o texto tal cual. */
function classifyFundingLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const fromPatterns = detectFundingFromText(t);
  return fromPatterns || t;
}

function detectProcedureCount(text: string): number {
  const m = text.match(/\b(\d{1,2})\s*(?:car|cas|casos|proc|proced|pac|pacientes?)\b/i);
  if (!m) return 0;
  const n = parseInt(m[1] ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Línea completa opcionalmente con viñeta: "- Dr Pérez", "Dra García López", "Dr. Pérez" */
const TITULAR_SURGEON_LINE = /^(-\s*)?(Dr\.?|Dra\.?)\s+(.+)$/i;

function tryParseTitularSurgeonLine(raw: string): { displayName: string; surfaceForMatch: string } | null {
  const trimmed = raw.trim();
  const m = trimmed.match(TITULAR_SURGEON_LINE);
  if (!m || !String(m[3] ?? "").trim()) return null;
  const honor = String(m[2]).replace(/\.$/, "").trim();
  const rest = String(m[3]).trim();
  const displayName = `${honor} ${rest}`.replace(/\s+/g, " ");
  return { displayName, surfaceForMatch: rest };
}

function matchSurgeonToDirectory(
  surfaceForMatch: string,
  displayName: string,
  surgeons: Array<{ id: string; name: string }>
): { id: string; name: string } | undefined {
  const surgeonNorm = normalizeLower(surfaceForMatch);
  const displayNorm = normalizeLower(displayName);
  return surgeons.find((s) => {
    const nameNorm = normalizeLower(s.name);
    return (
      nameNorm.includes(surgeonNorm) ||
      surgeonNorm.includes(nameNorm) ||
      nameNorm.split(" ").some((part) => part.length > 2 && surgeonNorm.includes(part)) ||
      displayNorm.includes(nameNorm) ||
      nameNorm.includes(displayNorm)
    );
  });
}

/** Línea `- …` que describe un procedimiento, no un titular Dr./Dra. */
function isProcedureBulletLine(line: string): boolean {
  if (!/^\s*-\s*/.test(line)) return false;
  const after = line.replace(/^\s*-\s*/, "").trim();
  return tryParseTitularSurgeonLine(after) === null;
}

function parseStructuredMedicalText(
  text: string,
  surgeons: Array<{ id: string; name: string }>
): QuickParseResult | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let titularDisplay: string | undefined;
  let titularMatch: { id: string; name: string } | undefined;
  for (const line of lines) {
    const parsedTit = tryParseTitularSurgeonLine(line);
    if (!parsedTit) continue;
    titularDisplay = parsedTit.displayName;
    titularMatch = matchSurgeonToDirectory(parsedTit.surfaceForMatch, parsedTit.displayName, surgeons);
    break;
  }

  const procedureLines = lines.filter(isProcedureBulletLine);
  if (!titularDisplay && procedureLines.length === 0) return null;
  if (!titularDisplay && procedureLines.length > 0) return null;

  const parsedPatients: Partial<PatientInBlock>[] = [];
  const fundingLabels = new Set<string>();
  for (const line of procedureLines) {
    const content = line.replace(/^\s*-\s*/, "").trim();
    if (!content) continue;
    const sep = content.indexOf(":");
    let procedure: string;
    let payerRaw: string;
    if (sep >= 0) {
      procedure = content.slice(0, sep).trim();
      payerRaw = content.slice(sep + 1).trim();
    } else {
      const tokens = content.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        procedure = (tokens[0] ?? "").trim();
        payerRaw = tokens.slice(1).join(" ").trim();
      } else {
        procedure = content.trim();
        payerRaw = "";
      }
    }
    if (!procedure) continue;
    const entidadFinanciadora = payerRaw ? classifyFundingLabel(payerRaw) : sep >= 0 ? "Desconocido" : "";
    if (entidadFinanciadora) {
      const lbl = detectFundingFromText(entidadFinanciadora) || entidadFinanciadora;
      fundingLabels.add(lbl);
    }
    parsedPatients.push({
      procedure,
      entidadFinanciadora,
      estimatedDurationMinutes: 60,
      admissionType: "ambulatorio",
      notes: "",
    });
  }

  const externalSurgeonName = titularMatch ? undefined : titularDisplay;
  const titularFreeLine = externalSurgeonName;

  return {
    parsedPatients,
    parseMode: "structured-medical",
    detectedSurgeonId: titularMatch?.id,
    detectedSurgeonName: titularMatch?.name ?? titularDisplay,
    externalSurgeonName,
    titularFreeLine,
    detectedProcedureCount: parsedPatients.length,
    detectedFundingLabels: Array.from(fundingLabels),
    recognizedAbbreviations: [],
    normalizedTerms: [],
    noiseRemovedCount: 0,
  };
}

function parseQuickBlockText(
  text: string,
  surgeons: Array<{ id: string; name: string }>
): QuickParseResult {
  const clean = text.trim();
  if (!clean) {
    return {
      parsedPatients: [],
      parseMode: "empty",
      detectedProcedureCount: 0,
      detectedFundingLabels: [],
      recognizedAbbreviations: [],
      normalizedTerms: [],
      noiseRemovedCount: 0,
    };
  }

  const structured = parseStructuredMedicalText(clean, surgeons);
  if (structured) return structured;

  const linesHeuristic = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let detectedSurgeonId: string | undefined;
  let detectedSurgeonName: string | undefined;
  let externalSurgeonName: string | undefined;
  let titularFreeLine: string | undefined;

  for (const line of linesHeuristic) {
    const tit = tryParseTitularSurgeonLine(line);
    if (!tit) continue;
    const surgeonHit = matchSurgeonToDirectory(tit.surfaceForMatch, tit.displayName, surgeons);
    if (surgeonHit) {
      detectedSurgeonId = surgeonHit.id;
      detectedSurgeonName = surgeonHit.name;
    } else {
      externalSurgeonName = tit.displayName;
      titularFreeLine = tit.displayName;
    }
    break;
  }

  const nonTitularLines = linesHeuristic.filter((ln) => tryParseTitularSurgeonLine(ln) === null);
  const bodyForHeuristic = nonTitularLines.join("\n").trim();

  if (!bodyForHeuristic && (externalSurgeonName || detectedSurgeonId)) {
    return {
      parsedPatients: [],
      parseMode: "heuristic",
      detectedSurgeonId,
      detectedSurgeonName,
      externalSurgeonName,
      titularFreeLine,
      detectedProcedureCount: 0,
      detectedFundingLabels: [],
      recognizedAbbreviations: [],
      normalizedTerms: [],
      noiseRemovedCount: 0,
    };
  }

  const lower = normalizeLower(bodyForHeuristic || clean);
  if (!detectedSurgeonId && !externalSurgeonName) {
    for (const s of surgeons) {
      const nameNorm = normalizeLower(s.name);
      const parts = nameNorm.split(" ").filter(Boolean);
      const surname = parts.length > 1 ? parts[parts.length - 1] : nameNorm;
      if (lower.includes(nameNorm) || (surname.length > 3 && lower.includes(surname))) {
        detectedSurgeonId = s.id;
        detectedSurgeonName = s.name;
        break;
      }
    }
  }

  let noiseRemovedCount = 0;
  let sanitized = bodyForHeuristic || clean;
  for (const np of NOISE_PATTERNS) {
    const matches = sanitized.match(np);
    if (matches?.length) noiseRemovedCount += matches.length;
    sanitized = sanitized.replace(np, " ");
  }
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim();

  const splitBySeparators = sanitized
    .split(/\/\/|\n|;/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const recognizedAbbreviations = new Set<string>();
  const normalizedTerms = new Set<string>();

  const likelyProcedures = splitBySeparators.map((part) => {
    let normalized = part;
    for (const map of PROCEDURE_ABBREVIATIONS) {
      if (map.pattern.test(normalized)) {
        recognizedAbbreviations.add(map.token);
        normalizedTerms.add(map.normalized);
      }
      normalized = normalized.replace(map.pattern, map.confident ? map.normalized : map.token);
    }
    return normalized.replace(/\s{2,}/g, " ").trim();
  }).filter((part) => {
    const p = normalizeLower(part);
    if (tryParseTitularSurgeonLine(part)) return false;
    return !p.startsWith("dr ") && !p.startsWith("dra ") && !p.includes("mutual") && !p.includes("mutua") && !p.includes("sespa") && !p.includes("privado");
  });

  const targetCount = detectProcedureCount(bodyForHeuristic || clean);
  const inferredCount = targetCount > 0 ? targetCount : Math.max(1, likelyProcedures.length);

  const entities = Array.from(
    new Set(
      splitBySeparators
        .map(detectFundingFromText)
        .filter(Boolean)
    )
  );
  const mainFunding = entities[0] ?? detectFundingFromText(bodyForHeuristic || clean);

  const parsedPatients: Partial<PatientInBlock>[] = [];
  for (let i = 0; i < inferredCount; i++) {
    const rawProc = likelyProcedures[i] ?? likelyProcedures[likelyProcedures.length - 1] ?? `Procedimiento ${i + 1}`;
    parsedPatients.push({
      procedure: rawProc.trim(),
      entidadFinanciadora: mainFunding || "",
      estimatedDurationMinutes: 60,
      admissionType: "ambulatorio",
      notes: "",
    });
  }

  return {
    parsedPatients,
    parseMode: "heuristic",
    detectedSurgeonId,
    detectedSurgeonName,
    externalSurgeonName,
    titularFreeLine,
    detectedProcedureCount: inferredCount,
    detectedFundingLabels: entities,
    recognizedAbbreviations: Array.from(recognizedAbbreviations),
    normalizedTerms: Array.from(normalizedTerms),
    noiseRemovedCount,
  };
}

export function ProgramarPacientesModal({
  slots,
  schedulerRole,
  schedulerSelfDisplayName,
  onSave,
  onClose,
  saving = false,
}: ProgramarPacientesModalProps) {
  const [patients, setPatients] = useState<Partial<PatientInBlock>[]>([{}]);
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickParseMessage, setQuickParseMessage] = useState<string | null>(null);
  const [responsibleSurgeonId, setResponsibleSurgeonId] = useState("");
  /** Referencia libre del titular (p. ej. Dr. no registrado). Si hay cirujano interno, puede convivir y se añade a notas. */
  const [externalSurgeonDisplayName, setExternalSurgeonDisplayName] = useState("");
  const [error, setError] = useState("");
  const totalReserved = totalReservedMinutes(slots);

  const requireResponsibleSurgeon = schedulerRole ? hasGestorAccess(schedulerRole) : false;

  const responsibleSurgeonCandidates = useMemo(() => {
    return getUsers().filter((u) => {
      if (!u.approved) return false;
      const r = String(u.role).trim().toLowerCase().replace(/_/g, "-");
      return r === "cirujano" || r === "endoscopista";
    });
  }, []);

  const titularResolved = useMemo(
    () =>
      resolveTitularSchedulerForm({
        responsibleSurgeonId,
        externalSurgeonDisplayName,
        surgeonCandidates: responsibleSurgeonCandidates,
        requireInternalUser: requireResponsibleSurgeon,
        schedulerSelfDisplayName,
      }),
    [
      responsibleSurgeonId,
      externalSurgeonDisplayName,
      responsibleSurgeonCandidates,
      requireResponsibleSurgeon,
      schedulerSelfDisplayName,
    ]
  );

  const addPatient = () => setPatients((prev) => [...prev, {}]);
  const removePatient = (index: number) => setPatients((prev) => prev.filter((_, i) => i !== index));
  const updatePatient = (index: number, field: keyof PatientInBlock, value: string | number | boolean) => {
    setPatients((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const updateSolicitudRecursos = (index: number, value: SolicitudRecursosId | "") => {
    setPatients((prev) =>
      prev.map((p, i) => (i === index ? { ...p, solicitudRecursos: value === "" ? undefined : value } : p))
    );
  };

  const currentTotal = programmingTotalMinutes(patients);
  const over = currentTotal > totalReserved;
  const programmedForRemainder = programmingTotalMinutes(patients);
  const remainderMinutes = Math.max(0, totalReserved - programmedForRemainder);
  const showWideRemainder =
    !over && totalReserved > 0 && remainderMinutes >= LARGE_BLOCK_REMAINDER_MINUTES;
  const validRowsCount = patients.filter((p) => rowHasRequiredCore(p)).length;
  const quickParsedPreview = useMemo(
    () => parseQuickBlockText(quickText, responsibleSurgeonCandidates),
    [quickText, responsibleSurgeonCandidates]
  );

  const applyTitularFromParsed = (parsed: QuickParseResult) => {
    const ext = parsed.externalSurgeonName ?? parsed.titularFreeLine;
    if (parsed.detectedSurgeonId) {
      setResponsibleSurgeonId(parsed.detectedSurgeonId);
      setExternalSurgeonDisplayName(ext?.trim() ? ext : "");
    } else if (ext?.trim()) {
      setExternalSurgeonDisplayName(ext.trim());
      if (requireResponsibleSurgeon) setResponsibleSurgeonId("");
    }
  };

  const applyQuickParse = () => {
    setQuickParseMessage(null);
    const parsed = parseQuickBlockText(quickText, responsibleSurgeonCandidates);
    const hasTitular =
      !!(parsed.detectedSurgeonId || parsed.externalSurgeonName?.trim() || parsed.titularFreeLine?.trim());
    if (parsed.parsedPatients.length === 0 && !hasTitular) {
      setQuickParseMessage("No se pudo interpretar el texto. Puede seguir en edición manual.");
      return;
    }
    if (parsed.parsedPatients.length > 0) {
      setPatients(parsed.parsedPatients);
    }
    if (parsed.parseMode === "structured-medical" || (parsed.parseMode === "heuristic" && hasTitular)) {
      applyTitularFromParsed(parsed);
    }
    const freeName = parsed.externalSurgeonName ?? parsed.titularFreeLine;
    const titularMsg = parsed.detectedSurgeonId
      ? `Cirujano asignado (usuario del sistema): ${parsed.detectedSurgeonName ?? ""}.`
      : freeName
        ? `Cirujano libre (texto): ${freeName}. Si es gestor, elija además un usuario interno para el registro del hueco.`
        : `Titular: ${parsed.detectedSurgeonName ?? "no identificado en texto"}.`;
    const detectedSummary =
      parsed.parsedPatients.length === 0 && hasTitular
        ? `${titularMsg} Añada líneas "- procedimiento: entidad" o use edición manual para los pacientes.`
        : `${titularMsg} · ${parsed.detectedProcedureCount} procedimiento(s)`;
    setQuickParseMessage(
      `${detectedSummary}. Se han generado ${parsed.parsedPatients.length} paciente(s). Revise procedimiento, entidad y nº historia (obligatorios); el resto es opcional${
        parsed.normalizedTerms.some((t) => t.includes("(revisar)")) ? " (hay abreviaturas ambiguas marcadas para revisar)." : "."
      } [modo: ${parsed.parseMode}]`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const valid = patients.filter((p) => rowHasRequiredCore(p));
    if (valid.length === 0) {
      setError("Rellene al menos un paciente con procedimiento, entidad gestora y nº de historia clínica.");
      return;
    }
    if (requireResponsibleSurgeon) {
      if (!responsibleSurgeonId.trim()) {
        setError(
          externalSurgeonDisplayName.trim()
            ? "Hay cirujano en texto libre, pero la API exige un cirujano/endoscopista interno del listado para el titular del hueco. Seleccione uno; el nombre libre se guardará en las notas."
            : "Seleccione el cirujano o endoscopista responsable del caso."
        );
        return;
      }
    }
    const total = valid.reduce((s, p) => s + rowMinutesForQuota(p), 0);
    if (total > totalReserved) {
      setError("El tiempo total supera el reservado. Reduzca pacientes o tiempos.");
      return;
    }
    const defaultSolicitud: SolicitudRecursosId = "ninguno";
    const refTitular = externalSurgeonDisplayName.trim();
    const internalName = requireResponsibleSurgeon
      ? responsibleSurgeonCandidates.find((u) => u.id === responsibleSurgeonId.trim())?.name?.trim()
      : "";
    const notePrefix =
      refTitular && (!internalName || normalizeLower(refTitular) !== normalizeLower(internalName))
        ? `[Cirujano titular (texto libre): ${refTitular}]\n`
        : "";
    const withOrder: Omit<PatientInBlock, "id" | "order">[] = valid.map((p, i) => {
      const duration =
        typeof p.estimatedDurationMinutes === "number" && Number.isFinite(p.estimatedDurationMinutes) && p.estimatedDurationMinutes > 0
          ? p.estimatedDurationMinutes
          : 60;
      const anesthesia = p.anesthesiaType?.trim() ? p.anesthesiaType.trim() : "Por determinar";
      const baseNotes = p.notes?.trim() ?? "";
      const notesJoined = notePrefix ? (baseNotes ? `${notePrefix}${baseNotes}` : notePrefix.trimEnd()) : baseNotes;
      return {
        name: p.name,
        numeroHistoria: p.numeroHistoria!.trim(),
        procedure: p.procedure!.trim(),
        estimatedDurationMinutes: duration,
        anesthesiaType: anesthesia,
        entidadFinanciadora: p.entidadFinanciadora!.trim(),
        admissionType: (p.admissionType as AdmissionType) ?? "ambulatorio",
        notes: notesJoined,
        solicitudRecursos: (p.solicitudRecursos ? p.solicitudRecursos : defaultSolicitud) as SolicitudRecursosId,
        order: i,
        patientEmail: p.patientEmail?.trim() || undefined,
        patientPhone: p.patientPhone?.trim() || undefined,
        isDeferredUrgency: !!p.isDeferredUrgency,
        specialCircuitReason: p.isDeferredUrgency ? (p.specialCircuitReason?.trim() || undefined) : undefined,
      };
    });

    try {
      await onSave(
        withOrder,
        requireResponsibleSurgeon
          ? {
              responsibleSurgeonId: responsibleSurgeonId.trim(),
              externalSurgeonName: externalSurgeonDisplayName.trim() || undefined,
            }
          : undefined
      );
      onClose();
    } catch {
      setError("Error al guardar. Compruebe que el hueco sigue libre e intente de nuevo.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border-t-4 border-[var(--ribera-navy)] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="programar-pacientes-title"
      >
        <h2 id="programar-pacientes-title" className="mb-1 text-xl font-bold text-[var(--ribera-navy)]">
          Reservar y programar pacientes
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Obligatorios: procedimiento, entidad gestora y nº de historia. Anestesia, duración y solicitud de recursos son opcionales (se completan por defecto al guardar si faltan).
        </p>
        <div className="mb-4 rounded-lg border border-[var(--ribera-navy)]/20 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ribera-navy)]">
            Cirujano titular (interno o externo)
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-900">Cirujano titular</span>
            <span className="text-sm text-slate-800">{titularResolved.displayName}</span>
            {titularResolved.state === "empty" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                Pendiente
              </span>
            ) : titularResolved.kind === "internal" ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Usuario interno
              </span>
            ) : (
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                Cirujano externo
              </span>
            )}
          </div>
          {titularResolved.externalNoteReference ? (
            <p className="mb-3 text-xs text-slate-600">
              <span className="font-medium text-slate-800">Referencia en notas (no sustituye al interno):</span>{" "}
              {titularResolved.externalNoteReference}
            </p>
          ) : null}
          {requireResponsibleSurgeon && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-800">Usuario interno (registro en sistema) *</span>
              <select
                value={responsibleSurgeonId}
                onChange={(e) => setResponsibleSurgeonId(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccione…</option>
                {responsibleSurgeonCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-600">
                Obligatorio para la API (`surgeonId`). Si difiere del nombre en notas, ambos se conservan.
              </span>
            </label>
          )}
          <label className={`block ${requireResponsibleSurgeon ? "mt-3" : ""}`}>
            <span className="block text-sm font-medium text-gray-700">Nombre en notas (titular externo)</span>
            <input
              type="text"
              value={externalSurgeonDisplayName}
              onChange={(e) => setExternalSurgeonDisplayName(e.target.value)}
              placeholder='Ej. Dr Pérez, Dra García López (también se detecta con "Convertir" desde líneas - Dr …)'
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-gray-600">
              {requireResponsibleSurgeon
                ? "Opcional: cirujano no dado de alta o constancia adicional. Se guarda al inicio de las notas de cada paciente si no coincide con el usuario interno."
                : "Opcional: se antepone a las notas; el hueco sigue registrado a su usuario en el sistema."}
            </span>
          </label>
        </div>
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="font-medium text-slate-500">Tiempo reservado</p>
              <p className="text-base font-semibold text-[var(--ribera-navy)]">{totalReserved} min</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="font-medium text-slate-500">Estimado actual</p>
              <p className={`text-base font-semibold ${over ? "text-rose-700" : "text-slate-800"}`}>{programmedForRemainder} min</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="font-medium text-slate-500">Disponible</p>
              <p className={`text-base font-semibold ${remainderMinutes > 0 ? "text-gray-800" : "text-slate-700"}`}>{remainderMinutes} min</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Cada procedimiento suma su tiempo estimado + {TRANSITION_MINUTES_PER_PROCEDURE} min de limpieza/anestesia.
          </p>
        </div>
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-sm font-semibold text-[var(--ribera-navy)]">Datos del paciente y solicitud de recursos</p>
        </div>
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={quickMode}
              onChange={(e) => setQuickMode(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[var(--ribera-red)] focus:ring-[var(--ribera-red)]"
            />
            Modo rápido (tipo Excel)
          </label>
          {quickMode && (
            <div className="mt-3 space-y-3">
              <textarea
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder={`Ejemplo estructurado:\nDr Rojas\n- CAR: ASISA\n- CAR PRIVADO\n\nCon viñeta en el titular:\n- Dr Pérez\n- FACO: MAPFRE\n\nO sin dos puntos:\nDra Castellanos\n- FACO MAPFRE\n- PRP PRIVADO\n\nModo libre (heurístico): DR ROJAS 3 CAR mutual // PRP`}
                className="min-h-[110px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <StatusBadge tone="info">Procedimientos detectados: {quickParsedPreview.detectedProcedureCount}</StatusBadge>
                {quickParsedPreview.detectedFundingLabels.length > 0 && (
                  <StatusBadge tone="neutral">Entidad: {quickParsedPreview.detectedFundingLabels.join(", ")}</StatusBadge>
                )}
                {quickParsedPreview.detectedSurgeonId && quickParsedPreview.detectedSurgeonName && (
                  <StatusBadge tone="success">
                    Titular · Usuario interno: {quickParsedPreview.detectedSurgeonName}
                  </StatusBadge>
                )}
                {(quickParsedPreview.externalSurgeonName ?? quickParsedPreview.titularFreeLine) &&
                  !quickParsedPreview.detectedSurgeonId && (
                  <StatusBadge tone="neutral">
                    Titular · Cirujano externo: {quickParsedPreview.externalSurgeonName ?? quickParsedPreview.titularFreeLine}
                  </StatusBadge>
                )}
                {quickParsedPreview.noiseRemovedCount > 0 && (
                  <StatusBadge tone="warning">Ruido limpiado: {quickParsedPreview.noiseRemovedCount}</StatusBadge>
                )}
              </div>
              {quickParsedPreview.recognizedAbbreviations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Abreviaturas reconocidas:</span>
                  {quickParsedPreview.recognizedAbbreviations.map((abbr) => (
                    <StatusBadge key={abbr} tone="neutral" size="sm">{abbr}</StatusBadge>
                  ))}
                </div>
              )}
              {quickParsedPreview.normalizedTerms.length > 0 && (
                <p className="text-xs text-slate-600">
                  Normalización aplicada: {quickParsedPreview.normalizedTerms.slice(0, 5).join(", ")}
                  {quickParsedPreview.normalizedTerms.length > 5 ? "..." : ""}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={applyQuickParse} className="btn-ribera-primary">
                  Convertir a pacientes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickText("");
                    setQuickParseMessage(null);
                  }}
                  className="btn-ribera-secondary"
                >
                  Limpiar texto
                </button>
              </div>
              {quickParseMessage && <InlineNotice variant="info">{quickParseMessage}</InlineNotice>}
            </div>
          )}
        </div>
        {over && (
          <InlineNotice variant="error" className="mb-4 font-medium">
            El tiempo total introducido ({currentTotal} min) supera el reservado ({totalReserved} min). Debe reducir pacientes o tiempos.
          </InlineNotice>
        )}
        {showWideRemainder && (
          <InlineNotice variant="warning" className="mb-4">
            <span className="font-semibold">Holgura amplia:</span> quedan unos{" "}
            <strong>{remainderMinutes} min</strong> sin usar dentro del bloque reservado. Puede valorar otro procedimiento
            corto o revisar el rango reservado si sobra mucho tiempo.
          </InlineNotice>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <>
          {patients.map((p, index) => (
            <fieldset key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Paciente {index + 1}</span>
                  {p.procedure?.trim() ? (
                    <span className="max-w-[280px] truncate text-xs font-medium text-slate-600" title={p.procedure}>
                      {p.procedure}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin procedimiento indicado</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={rowHasRequiredCore(p) ? "success" : "warning"}>
                    {rowHasRequiredCore(p) ? "Mínimo OK" : "Faltan obligatorios"}
                  </StatusBadge>
                  {patients.length > 1 && (
                    <button type="button" onClick={() => removePatient(index)} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="block text-sm font-medium text-gray-700">Nº historia clínica *</span>
                  <input
                    type="text"
                    value={p.numeroHistoria ?? ""}
                    onChange={(e) => updatePatient(index, "numeroHistoria", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Email del paciente (opcional)</span>
                  <input
                    type="email"
                    autoComplete="off"
                    value={p.patientEmail ?? ""}
                    onChange={(e) => updatePatient(index, "patientEmail", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="contacto@ejemplo.com"
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Teléfono del paciente (opcional)</span>
                  <input
                    type="tel"
                    autoComplete="off"
                    value={p.patientPhone ?? ""}
                    onChange={(e) => updatePatient(index, "patientPhone", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Ej. 600 000 000"
                  />
                </label>
                <div className="sm:col-span-2 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!p.isDeferredUrgency}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPatients((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? { ...row, isDeferredUrgency: checked, specialCircuitReason: checked ? row.specialCircuitReason : "" }
                              : row,
                          ),
                        );
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-[var(--ribera-red)] focus:ring-[var(--ribera-red)]"
                    />
                    <span className="text-sm font-medium text-slate-800">Urgencia diferida / caso especial</span>
                  </label>
                  <p className="mt-1 pl-6 text-xs text-slate-600">
                    Si lo marca, no se autocitará preanestesia; el equipo de gestión revisará el caso.
                  </p>
                  {p.isDeferredUrgency ? (
                    <label className="mt-2 block pl-6">
                      <span className="block text-sm font-medium text-gray-700">Motivo / comentario (opcional)</span>
                      <textarea
                        value={p.specialCircuitReason ?? ""}
                        onChange={(e) => updatePatient(index, "specialCircuitReason", e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Ej. Coordinación con otra unidad, documentación pendiente…"
                      />
                    </label>
                  ) : null}
                </div>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Entidad gestora *</span>
                  <input
                    type="text"
                    value={p.entidadFinanciadora ?? ""}
                    onChange={(e) => updatePatient(index, "entidadFinanciadora", e.target.value)}
                    placeholder="Ej. Mutua, Privado, SAS..."
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Procedimiento *</span>
                  <input
                    type="text"
                    value={p.procedure ?? ""}
                    onChange={(e) => updatePatient(index, "procedure", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Ingreso o ambulatorio (opcional)</span>
                  <select
                    value={p.admissionType ?? "ambulatorio"}
                    onChange={(e) => updatePatient(index, "admissionType", e.target.value as AdmissionType)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="ambulatorio">Ambulatorio</option>
                    <option value="ingreso">Ingreso</option>
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Tipo de anestesia (opcional)</span>
                  <select
                    value={p.anesthesiaType ?? ""}
                    onChange={(e) => updatePatient(index, "anesthesiaType", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sin especificar (se usará «Por determinar» al guardar)</option>
                    {ANESTHESIA_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Tiempo estimado (min) (opcional)</span>
                  <input
                    type="number"
                    min={1}
                    value={p.estimatedDurationMinutes ?? ""}
                    onChange={(e) => {
                  const raw = e.target.value;
                  const n = parseInt(raw, 10);
                  const val = raw !== "" && !Number.isNaN(n) && n >= 0 ? n : 0;
                  updatePatient(index, "estimatedDurationMinutes", val);
                }}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Vacío → 60 min al guardar"
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Solicitud de recursos (opcional)</span>
                  <select
                    value={p.solicitudRecursos ?? ""}
                    onChange={(e) => updateSolicitudRecursos(index, e.target.value as SolicitudRecursosId | "")}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sin especificar (se usará «Ninguno de ellos» al guardar)</option>
                    {SOLICITUD_RECURSOS_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Notas (opcional)</span>
                  <input
                    type="text"
                    value={p.notes ?? ""}
                    onChange={(e) => updatePatient(index, "notes", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </fieldset>
          ))}
          <button type="button" onClick={addPatient} className="btn-ribera-secondary">
            + Añadir otro paciente
          </button>
          </>
          {error && (
            <InlineNotice variant="error" role="alert">
              {error}
            </InlineNotice>
          )}
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>Pacientes en formulario: <strong>{patients.length}</strong></span>
              <span>Listos para guardar (mínimo): <strong>{validRowsCount}</strong></span>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <button
              type="submit"
              className="btn-ribera-primary min-h-11 px-6 text-base shadow-md shadow-slate-900/10"
              disabled={over || saving}
            >
              {saving ? "Guardando…" : "Guardar y programar"}
            </button>
            <button type="button" onClick={onClose} className="btn-ribera-secondary min-h-11">
              Cancelar
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
