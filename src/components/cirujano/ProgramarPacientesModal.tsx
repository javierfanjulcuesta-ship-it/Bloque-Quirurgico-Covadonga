"use client";

/**
 * Modal para añadir pacientes a una reserva. Valida que el tiempo total (procedimiento + 10 min por paciente) no exceda el tiempo reservado.
 */

import { useState, useMemo, useRef } from "react";
import type { PatientInBlock, AdmissionType, SolicitudRecursosId } from "@/lib/types";
import {
  TRANSITION_MINUTES_PER_PROCEDURE,
  SOLICITUD_RECURSOS_OPTIONS,
  LARGE_BLOCK_REMAINDER_MINUTES,
} from "@/lib/constants";
import { getEffectiveTotalMinutesFilledRows, getSlotDurationMinutes, getSlots } from "@/lib/utils";
import type { Shift } from "@/lib/types";
import { hasGestorAccess, type UserRole } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useUsers } from "@/context/UsersContext";
import { classifyFunding } from "@/lib/patientInsurance";

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

function sameSlotContext(slots: SlotSelection[]): { date: string; shift: Shift; resourceId: string } | null {
  if (!slots.length) return null;
  const first = slots[0]!;
  const same = slots.every(
    (s) => s.date === first.date && s.shift === first.shift && s.resourceId === first.resourceId
  );
  return same ? { date: first.date, shift: first.shift, resourceId: first.resourceId } : null;
}

export interface ProgramarPacientesModalProps {
  slots: SlotSelection[];
  /** ID del usuario actual (cirujano/endoscopista) para excluirlo de la lista de 2º cirujano */
  currentUserId?: string;
  /** Rol del usuario que abre el modal (gestor / gestor-anestesista → cirujano responsable obligatorio). */
  schedulerRole?: UserRole | string;
  /** Prefill opcional del titular de bloque ya elegido en la cabecera de selección. */
  initialResponsibleSurgeonId?: string;
  initialExternalSurgeonName?: string;
  onSave: (
    patients: Omit<PatientInBlock, "id" | "order">[],
    coSurgeonIds?: string[],
    meta?: { responsibleSurgeonId?: string; externalSurgeonName?: string }
  ) => void | Promise<void>;
  onRequestExpandReservation?: (
    extraMinutesNeeded: number
  ) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
  /** Si true, deshabilita el botón guardar (ej. mientras se guarda en API) */
  saving?: boolean;
}

const ANESTHESIA_OPTIONS = ["Local", "Regional", "General", "Sedación"];

interface QuickParseResult {
  parsedPatients: Partial<PatientInBlock>[];
  detectedSurgeonId?: string;
  detectedSurgeonName?: string;
  detectedExternalSurgeonName?: string;
  detectedSurgeonSource: "internal" | "external" | "none";
  detectedProcedureCount: number;
  detectedFundingLabels: string[];
  recognizedAbbreviations: string[];
  normalizedTerms: string[];
  noiseRemovedCount: number;
  parseMode: "structured" | "heuristic" | "none";
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

const PROCEDURE_TERM_PATTERNS: RegExp[] = [
  /\bholep\b/i,
  /\bfaco(?:emulsificacion|emulsificación|s)?\b/i,
  /\bprp\b/i,
  /\bfx\b/i,
  /\bfractura\b/i,
  /\blca\b/i,
  /\bptr\b/i,
  /\bptc\b/i,
  /\bcar\b/i,
  /\bmc\b/i,
  /\bcah\b/i,
];

function safeTest(rx: RegExp, value: string): boolean {
  // NOTE: /g regex are stateful via lastIndex. Clone them to avoid inconsistent results.
  const flags = rx.flags.replace("g", "");
  const cloned = new RegExp(rx.source, flags);
  return cloned.test(value);
}

function safeReplaceGlobal(rx: RegExp, value: string, replacement: string): string {
  const flags = rx.flags.includes("g") ? rx.flags : `${rx.flags}g`;
  const cloned = new RegExp(rx.source, flags);
  return value.replace(cloned, replacement);
}

function detectFundingFromText(text: string): string {
  for (const f of FUNDING_PATTERNS) {
    if (f.patterns.some((p) => p.test(text))) return f.label;
  }
  return "";
}

function detectProcedureCount(text: string): number {
  const m = text.match(/\b(\d{1,2})\s*(?:car|cas|casos|proc|proced|pac|pacientes?)\b/i);
  if (!m) return 0;
  const n = parseInt(m[1] ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function titleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDoctorLine(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(dra?|doctora?)\.?\s+(.+)$/i);
  if (!match) return normalized;
  const prefixRaw = (match[1] ?? "").toLowerCase();
  const namePart = titleCaseWords(match[2] ?? "");
  const prefix = prefixRaw === "dra" || prefixRaw === "doctora" ? "Dra." : "Dr.";
  return `${prefix} ${namePart}`.trim();
}

function normalizeFundingLabel(fundingRaw: string): string {
  const normalized = normalizeLower(fundingRaw);
  if (!normalized) return "";
  if (normalized === "sespa") return "SESPA";
  if (normalized === "privado" || normalized === "privada") return "PRIVADO";
  return fundingRaw.trim().replace(/\s+/g, " ");
}

function detectSurgeonFromLine(
  surgeonLine: string,
  surgeons: Array<{ id: string; name: string }>
): Pick<QuickParseResult, "detectedSurgeonId" | "detectedSurgeonName" | "detectedExternalSurgeonName" | "detectedSurgeonSource"> {
  const normalizedInput = normalizeLower(surgeonLine);
  for (const s of surgeons) {
    const nameNorm = normalizeLower(s.name);
    const parts = nameNorm.split(" ").filter(Boolean);
    const surname = parts.length > 1 ? parts[parts.length - 1] : nameNorm;
    if (
      normalizedInput.includes(nameNorm) ||
      nameNorm.includes(normalizedInput) ||
      (surname.length > 3 && normalizedInput.includes(surname))
    ) {
      return {
        detectedSurgeonId: s.id,
        detectedSurgeonName: s.name,
        detectedSurgeonSource: "internal",
      };
    }
  }
  return {
    detectedExternalSurgeonName: normalizeDoctorLine(surgeonLine),
    detectedSurgeonSource: "external",
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
      detectedProcedureCount: 0,
      detectedSurgeonSource: "none",
      detectedFundingLabels: [],
      recognizedAbbreviations: [],
      normalizedTerms: [],
      noiseRemovedCount: 0,
      parseMode: "none",
    };
  }

  const structuredLines = clean
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const surgeonLine = structuredLines[0] ?? "";
  const structuredPatientLines = structuredLines.slice(1).filter((line) => line.startsWith("-"));
  const isStructuredInput =
    /(?:^|\s)(dr|dra)\.?(?:\s|$)/i.test(surgeonLine) && structuredPatientLines.length > 0;

  if (isStructuredInput) {
    const surgeonDetection = detectSurgeonFromLine(surgeonLine, surgeons);
    const parsedPatients: Partial<PatientInBlock>[] = [];
    const structuredFundingLabels = new Set<string>();

    for (const line of structuredPatientLines) {
      const content = line.replace(/^-+\s*/, "").trim();
      if (!content) continue;
      const [procedureToken, ...fundingTokens] = content.split(/\s+/).filter(Boolean);
      if (!procedureToken) continue;

      const procedure = procedureToken.toUpperCase();
      const rawFunding = fundingTokens.join(" ").trim();
      const entidadFinanciadora = normalizeFundingLabel(rawFunding);
      if (entidadFinanciadora) structuredFundingLabels.add(entidadFinanciadora);
      const fundingCategory = classifyFunding(rawFunding);
      const insuranceTypeLabel =
        fundingCategory === "sespa"
          ? "sespa"
          : fundingCategory === "private"
            ? "privado"
            : fundingCategory === "mutual"
              ? "mutua"
              : "";

      parsedPatients.push({
        procedure,
        entidadFinanciadora,
        estimatedDurationMinutes: 60,
        admissionType: "ambulatorio",
        notes: `[IMPORTADO TEXTO LIBRE]${insuranceTypeLabel ? ` · financiación detectada: ${insuranceTypeLabel}` : ""}`,
      });
    }

    if (parsedPatients.length > 0) {
      return {
        parsedPatients,
        detectedSurgeonId: surgeonDetection.detectedSurgeonId,
        detectedSurgeonName: surgeonDetection.detectedSurgeonName,
        detectedExternalSurgeonName: surgeonDetection.detectedExternalSurgeonName,
        detectedSurgeonSource: surgeonDetection.detectedSurgeonSource,
        detectedProcedureCount: parsedPatients.length,
        detectedFundingLabels: Array.from(structuredFundingLabels),
        recognizedAbbreviations: [],
        normalizedTerms: [],
        noiseRemovedCount: 0,
        parseMode: "structured",
      };
    }
  }

  const lower = normalizeLower(clean);
  let detectedSurgeonId: string | undefined;
  let detectedSurgeonName: string | undefined;
  let detectedExternalSurgeonName: string | undefined;
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
  if (!detectedSurgeonId) {
    const dr =
      clean.match(/\bdr\.?\s*([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,3})/i) ||
      clean.match(/\bdra\.?\s*([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,3})/i);
    if (dr?.[1]) {
      const raw = dr[1].trim().replace(/[0-9]/g, "").replace(/\s+/g, " ").trim();
      if (raw.length >= 3) {
        detectedExternalSurgeonName = `Dr. ${raw.replace(/\b\w/g, (m) => m.toUpperCase())}`;
      }
    }
  }

  let noiseRemovedCount = 0;
  let sanitized = clean;
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
      if (safeTest(map.pattern, normalized)) {
        recognizedAbbreviations.add(map.token);
        normalizedTerms.add(map.normalized);
      }
      normalized = safeReplaceGlobal(map.pattern, normalized, map.confident ? map.normalized : map.token);
    }
    return normalized.replace(/\s{2,}/g, " ").trim();
  }).filter((part) => {
    const p = normalizeLower(part);
    return !p.startsWith("dr ") && !p.startsWith("dra ") && !p.includes("mutual") && !p.includes("mutua") && !p.includes("sespa") && !p.includes("privado");
  });

  const expandedProcedureChunks = likelyProcedures.flatMap((part) =>
    part
      .split(/\s+\+\s+|\s+y\s+|,\s*|\/\s*/gi)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const uniqueProcedures = Array.from(new Set(expandedProcedureChunks));
  const fallbackProcedureHits = PROCEDURE_TERM_PATTERNS.reduce((acc, rx) => {
    const m = clean.match(new RegExp(rx.source, rx.flags.includes("i") ? "gi" : "g"));
    return acc + (m?.length ?? 0);
  }, 0);
  const targetCount = detectProcedureCount(clean);
  const inferredCount = Math.max(
    1,
    targetCount,
    uniqueProcedures.length,
    likelyProcedures.length,
    fallbackProcedureHits
  );

  const entities = Array.from(
    new Set(
      splitBySeparators
        .map(detectFundingFromText)
        .filter(Boolean)
    )
  );
  const mainFunding = entities[0] ?? detectFundingFromText(clean);

  const parsedPatients: Partial<PatientInBlock>[] = [];
  for (let i = 0; i < inferredCount; i++) {
    const rawProc =
      uniqueProcedures[i] ??
      likelyProcedures[i] ??
      uniqueProcedures[uniqueProcedures.length - 1] ??
      likelyProcedures[likelyProcedures.length - 1] ??
      `Procedimiento ${i + 1}`;
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
    detectedSurgeonId,
    detectedSurgeonName,
    detectedExternalSurgeonName,
    detectedSurgeonSource: detectedSurgeonId ? "internal" : detectedExternalSurgeonName ? "external" : "none",
    detectedProcedureCount: inferredCount,
    detectedFundingLabels: entities,
    recognizedAbbreviations: Array.from(recognizedAbbreviations),
    normalizedTerms: Array.from(normalizedTerms),
    noiseRemovedCount,
    parseMode: "heuristic",
  };
}

export function ProgramarPacientesModal({
  slots,
  currentUserId,
  schedulerRole,
  initialResponsibleSurgeonId,
  initialExternalSurgeonName,
  onSave,
  onRequestExpandReservation,
  onClose,
  saving = false,
}: ProgramarPacientesModalProps) {
  const { users: ctxUsers } = useUsers();
  const [patients, setPatients] = useState<Partial<PatientInBlock>[]>([{}]);
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickParseMessage, setQuickParseMessage] = useState<string | null>(null);
  const [secondSurgeonName, setSecondSurgeonName] = useState("");
  const [responsibleSurgeonId, setResponsibleSurgeonId] = useState(initialResponsibleSurgeonId ?? "");
  const [externalSurgeonName, setExternalSurgeonName] = useState(initialExternalSurgeonName ?? "");
  const [error, setError] = useState("");
  const [expandingReservation, setExpandingReservation] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [resourceSelections, setResourceSelections] = useState<SolicitudRecursosId[][]>([[]]);
  const procedureRefs = useRef<Array<HTMLInputElement | null>>([]);
  const fundingRefs = useRef<Array<HTMLInputElement | null>>([]);
  const resourceRefs = useRef<Array<HTMLInputElement | null>>([]);
  const totalReserved = totalReservedMinutes(slots);

  const requireResponsibleSurgeon = schedulerRole ? hasGestorAccess(schedulerRole) : false;

  const otherSurgeons = useMemo(
    () =>
      ctxUsers.filter((u) => {
        if (!u.approved || u.id === currentUserId) return false;
        const r = String(u.role).trim().toLowerCase().replace(/_/g, "-");
        return r === "cirujano" || r === "endoscopista";
      }),
    [ctxUsers, currentUserId]
  );

  const responsibleSurgeonCandidates = useMemo(() => {
    return ctxUsers.filter((u) => {
      if (!u.approved) return false;
      const r = String(u.role).trim().toLowerCase().replace(/_/g, "-");
      return r === "cirujano" || r === "endoscopista";
    });
  }, [ctxUsers]);

  const addPatient = () =>
    setPatients((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return [...prev, {}];
      setResourceSelections((prevSelections) => [...prevSelections, []]);
      return [
        ...prev,
        {
          entidadFinanciadora: last.entidadFinanciadora,
          anesthesiaType: last.anesthesiaType,
          admissionType: last.admissionType ?? "ambulatorio",
          estimatedDurationMinutes: last.estimatedDurationMinutes,
          solicitudRecursos: last.solicitudRecursos,
        },
      ];
    });
  const removePatient = (index: number) => {
    setPatients((prev) => prev.filter((_, i) => i !== index));
    setResourceSelections((prev) => prev.filter((_, i) => i !== index));
  };
  const updatePatient = (index: number, field: keyof PatientInBlock, value: string | number) => {
    setPatients((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const updateResourceSelection = (index: number, value: SolicitudRecursosId) => {
    setResourceSelections((prev) => {
      const base = prev[index] ?? [];
      let nextRow: SolicitudRecursosId[];
      if (value === "ninguno") {
        nextRow = base.includes("ninguno") ? [] : ["ninguno"];
      } else {
        const withoutNone = base.filter((id) => id !== "ninguno");
        nextRow = withoutNone.includes(value) ? withoutNone.filter((id) => id !== value) : [...withoutNone, value];
      }
      const next = [...prev];
      next[index] = nextRow;
      return next;
    });
  };

  const safeMinutes = (p: Partial<PatientInBlock>) =>
    typeof p.estimatedDurationMinutes === "number" && Number.isFinite(p.estimatedDurationMinutes) && p.estimatedDurationMinutes >= 0
      ? p.estimatedDurationMinutes
      : 0;
  const currentTotal = patients.reduce(
    (sum, p) => sum + safeMinutes(p) + TRANSITION_MINUTES_PER_PROCEDURE,
    0
  );
  const over = currentTotal > totalReserved;
  const programmedForRemainder = getEffectiveTotalMinutesFilledRows(patients);
  const remainderMinutes = Math.max(0, totalReserved - programmedForRemainder);
  const showWideRemainder = !over && totalReserved > 0 && remainderMinutes >= LARGE_BLOCK_REMAINDER_MINUTES;
  const needExtraMinutes = Math.max(0, currentTotal - totalReserved);
  const slotsContext = useMemo(() => sameSlotContext(slots), [slots]);
  const expansionPreview = useMemo(() => {
    if (needExtraMinutes <= 0) return { neededSlots: 0, canEstimate: true };
    if (!slotsContext) return { neededSlots: 0, canEstimate: false };
    const sorted = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
    const used = new Set(sorted.map((s) => s.slotIndex));
    let remaining = needExtraMinutes;
    let idx = sorted[sorted.length - 1]!.slotIndex + 1;
    let neededSlots = 0;
    const max = getSlots(slotsContext.shift).length - 1;
    while (remaining > 0 && idx <= max) {
      if (!used.has(idx)) {
        remaining -= getSlotDurationMinutes(slotsContext.shift, idx);
        neededSlots += 1;
      }
      idx += 1;
    }
    return { neededSlots, canEstimate: remaining <= 0 };
  }, [needExtraMinutes, slots, slotsContext]);
  const validRowsCount = patients.filter(
    (p, i) =>
      p.procedure?.trim() &&
      p.entidadFinanciadora?.trim() &&
      (resourceSelections[i]?.length ?? 0) > 0
  ).length;
  const nonEmptyRowsCount = patients.filter((p, index) => {
    return !!(
      p.numeroHistoria?.trim() ||
      p.procedure?.trim() ||
      p.entidadFinanciadora?.trim() ||
      p.anesthesiaType?.trim() ||
      (typeof p.estimatedDurationMinutes === "number" && Number.isFinite(p.estimatedDurationMinutes) && p.estimatedDurationMinutes > 0) ||
      p.notes?.trim() ||
      (resourceSelections[index]?.length ?? 0) > 0
    );
  }).length;
  const pendingRowsCount = Math.max(0, nonEmptyRowsCount - validRowsCount);
  const quickParsedPreview = useMemo(
    () => parseQuickBlockText(quickText, responsibleSurgeonCandidates),
    [quickText, responsibleSurgeonCandidates]
  );

  const getPrimaryResource = (index: number): SolicitudRecursosId | undefined => {
    const selected = resourceSelections[index] ?? [];
    const nonNone = selected.filter((id) => id !== "ninguno");
    if (nonNone.length > 0) return nonNone[0];
    return selected.includes("ninguno") ? "ninguno" : undefined;
  };

  const buildNotesWithResources = (baseNotes: string, index: number): string => {
    const selected = resourceSelections[index] ?? [];
    const cleanBase = baseNotes.replace(/\s*\[RECURSOS_LIMITADOS:[^\]]*\]\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
    if (selected.length === 0) return cleanBase;
    const labels = selected
      .map((id) => SOLICITUD_RECURSOS_OPTIONS.find((opt) => opt.id === id)?.label ?? id)
      .join(", ");
    return `${cleanBase} [RECURSOS_LIMITADOS: ${labels}]`.trim();
  };

  const applyQuickParse = () => {
    setQuickParseMessage(null);
    const parsed = parseQuickBlockText(quickText, responsibleSurgeonCandidates);
    if (parsed.parsedPatients.length === 0) {
      setQuickParseMessage("No se pudo interpretar el texto. Puede seguir en edición manual.");
      return;
    }
    setPatients(parsed.parsedPatients);
    setResourceSelections(parsed.parsedPatients.map(() => []));
    if (requireResponsibleSurgeon && parsed.detectedSurgeonId) {
      setResponsibleSurgeonId(parsed.detectedSurgeonId);
      setExternalSurgeonName("");
    } else if (requireResponsibleSurgeon && parsed.detectedExternalSurgeonName) {
      setResponsibleSurgeonId("");
      setExternalSurgeonName(parsed.detectedExternalSurgeonName);
    }
    setQuickParseMessage(
      `Se han generado ${parsed.parsedPatients.length} paciente(s) · cirujano detectado: ${
        parsed.detectedSurgeonSource === "internal"
          ? `${parsed.detectedSurgeonName}`
          : parsed.detectedSurgeonSource === "external"
            ? `${parsed.detectedExternalSurgeonName}`
            : "sin detección"
      }${parsed.parseMode === "structured" ? " (modo estructurado)." : "."} Revise y complete los campos obligatorios antes de guardar${
        parsed.parseMode === "heuristic" && parsed.normalizedTerms.some((t) => t.includes("(revisar)"))
          ? " (hay abreviaturas ambiguas marcadas para revisar)."
          : "."
      }`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitAttempted(true);
    const rowsToPersist = patients
      .map((p, i) => ({
        index: i,
        ...p,
        numeroHistoria: p.numeroHistoria?.trim() ?? "",
        procedure: p.procedure?.trim() ?? "",
        anesthesiaType: p.anesthesiaType?.trim() ?? "",
        entidadFinanciadora: p.entidadFinanciadora?.trim() ?? "",
        notes: p.notes?.trim() ?? "",
      }))
      .filter((p) => {
        const hasAny =
          !!p.numeroHistoria ||
          !!p.procedure ||
          !!p.anesthesiaType ||
          !!p.entidadFinanciadora ||
          !!p.notes ||
          (resourceSelections[p.index]?.length ?? 0) > 0 ||
          (typeof p.estimatedDurationMinutes === "number" && Number.isFinite(p.estimatedDurationMinutes) && p.estimatedDurationMinutes > 0);
        return hasAny;
      });
    const firstMissing = rowsToPersist.find(
      (row) => !row.procedure || !row.entidadFinanciadora || (resourceSelections[row.index]?.length ?? 0) === 0
    );
    if (firstMissing) {
      setError("Faltan datos obligatorios: procedimiento, financiación o recursos necesarios.");
      if (!firstMissing.procedure) {
        procedureRefs.current[firstMissing.index]?.focus();
      } else if (!firstMissing.entidadFinanciadora) {
        fundingRefs.current[firstMissing.index]?.focus();
      } else {
        resourceRefs.current[firstMissing.index]?.focus();
      }
      return;
    }
    if (requireResponsibleSurgeon) {
      if (!responsibleSurgeonId.trim() && !externalSurgeonName.trim()) {
        setError("Seleccione un cirujano responsable o escriba un nombre libre.");
        return;
      }
    }
    // Filosofía: NO bloquear guardado. Si faltan campos requeridos por BD, se rellenan con placeholders
    // marcados como pendientes, para completar después mediante edición.
    const withOrder: Omit<PatientInBlock, "id" | "order">[] = rowsToPersist.map((p, i) => {
      const pendingParts: string[] = [];
      const history = p.numeroHistoria?.trim();
      const proc = p.procedure?.trim();
      const anest = p.anesthesiaType?.trim();
      const fund = p.entidadFinanciadora?.trim();
      const dur = typeof p.estimatedDurationMinutes === "number" ? p.estimatedDurationMinutes : 0;
      if (!history) pendingParts.push("historia");
      if (!anest) pendingParts.push("anestesia");
      if (!(Number.isFinite(dur) && dur > 0)) pendingParts.push("duración");

      const pendingPrefix = pendingParts.length > 0 ? `[PENDIENTE: ${pendingParts.join(", ")}] ` : "";

      return {
        name: p.name,
        numeroHistoria: history || `PEND-${i + 1}`,
        procedure: proc!,
        estimatedDurationMinutes: Number.isFinite(dur) && dur > 0 ? dur : 60,
        anesthesiaType: anest || "Pendiente",
        entidadFinanciadora: fund!,
        admissionType: (p.admissionType as AdmissionType) ?? "ambulatorio",
        notes: buildNotesWithResources(`${pendingPrefix}${p.notes?.trim() ?? ""}`.trim(), p.index),
        solicitudRecursos: getPrimaryResource(p.index),
        order: i,
      };
    });

    let coSurgeonIds: string[] | undefined;
    const nameTrim = secondSurgeonName.trim();
    if (nameTrim) {
      const inputLower = nameTrim.toLowerCase();
      const match = otherSurgeons.find(
        (u) =>
          u.name.toLowerCase() === inputLower ||
          u.name.toLowerCase().includes(inputLower) ||
          inputLower.includes(u.name.toLowerCase())
      );
      if (!match) {
        setError("No hay ningún cirujano o endoscopista con ese nombre. Deje el campo vacío o compruebe el nombre.");
        return;
      }
      coSurgeonIds = [match.id];
    }

    try {
      await onSave(
        withOrder,
        coSurgeonIds,
        requireResponsibleSurgeon
          ? {
              responsibleSurgeonId: responsibleSurgeonId.trim() || undefined,
              externalSurgeonName: responsibleSurgeonId.trim() ? undefined : externalSurgeonName.trim() || undefined,
            }
          : undefined
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Error al guardar. Compruebe que el hueco sigue libre e intente de nuevo.";
      setError(msg);
    }
  };

  const handleExpandReservation = async () => {
    if (!onRequestExpandReservation || needExtraMinutes <= 0 || expandingReservation) return;
    setExpandingReservation(true);
    setQuickParseMessage(null);
    const result = await onRequestExpandReservation(needExtraMinutes);
    setExpandingReservation(false);
    setQuickParseMessage(
      result.ok
        ? "Reserva ampliada correctamente"
        : result.message ?? "No se pudo ampliar la reserva"
    );
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
          Revise tiempos, entidad financiadora y recursos antes de confirmar. La acción principal queda al final del formulario.
        </p>
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
              <p className={`text-base font-semibold ${remainderMinutes > 0 ? "text-emerald-700" : "text-slate-700"}`}>{remainderMinutes} min</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Cada procedimiento suma su tiempo estimado + {TRANSITION_MINUTES_PER_PROCEDURE} min de limpieza/anestesia.
          </p>
        </div>
        {requireResponsibleSurgeon && (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/80 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="mr-2 text-sm font-semibold text-slate-800">Titular del bloque (1 vez por bloque)</h3>
              <StatusBadge tone={responsibleSurgeonId.trim() ? "success" : "neutral"}>
                Titular por ID: {responsibleSurgeonId.trim() ? "sí" : "no"}
              </StatusBadge>
              <StatusBadge tone={!responsibleSurgeonId.trim() && externalSurgeonName.trim() ? "warning" : "neutral"}>
                Titular libre: {(!responsibleSurgeonId.trim() && externalSurgeonName.trim()) ? "sí" : "no"}
              </StatusBadge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-gray-800">Cirujano / endoscopista responsable</span>
              <select
                value={responsibleSurgeonId}
                onChange={(e) => {
                  const next = e.target.value;
                  setResponsibleSurgeonId(next);
                  if (next.trim()) setExternalSurgeonName("");
                }}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">No seleccionado (usar nombre libre)</option>
                {responsibleSurgeonCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-600">
                Prioridad: cirujano reconocido por ID. Si no existe en BD, use el campo libre inferior.
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-800">Nombre libre de cirujano (si no hay ID)</span>
              <input
                type="text"
                value={externalSurgeonName}
                onChange={(e) => {
                  const next = e.target.value;
                  setExternalSurgeonName(next);
                  if (next.trim()) setResponsibleSurgeonId("");
                }}
                placeholder="Ej. Dr. Pérez (externo)"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                maxLength={120}
              />
              <span className="mt-1 block text-xs text-gray-600">
                El titular del bloque se define una sola vez y se aplica a todos los pacientes del bloque.
              </span>
            </label>
            </div>
          </div>
        )}
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
                placeholder='Ejemplo: "DR ROJAS 3 CAR MC mutual // PRP // Fx muñeca fremap"'
                className="min-h-[110px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <StatusBadge tone="info">Procedimientos detectados: {quickParsedPreview.detectedProcedureCount}</StatusBadge>
                {quickParsedPreview.detectedFundingLabels.length > 0 && (
                  <StatusBadge tone="neutral">Entidad: {quickParsedPreview.detectedFundingLabels.join(", ")}</StatusBadge>
                )}
                {quickParsedPreview.detectedSurgeonName && (
                  <StatusBadge tone="success">Cirujano detectado (interno): {quickParsedPreview.detectedSurgeonName}</StatusBadge>
                )}
                {!quickParsedPreview.detectedSurgeonId && quickParsedPreview.detectedExternalSurgeonName && (
                  <StatusBadge tone="warning">Cirujano detectado (libre): {quickParsedPreview.detectedExternalSurgeonName}</StatusBadge>
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
              {quickParsedPreview.parseMode === "structured" ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Previsualización estructurada</p>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-medium">Cirujano detectado:</span>{" "}
                    {quickParsedPreview.detectedSurgeonSource === "internal"
                      ? quickParsedPreview.detectedSurgeonName
                      : quickParsedPreview.detectedExternalSurgeonName ?? "Sin detección"}
                  </p>
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Pacientes detectados:</span> {quickParsedPreview.parsedPatients.length}
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    {quickParsedPreview.parsedPatients.map((patient, index) => (
                      <li key={`${patient.procedure ?? "proc"}-${index}`}>
                        <span className="font-medium">{patient.procedure?.trim() || "Procedimiento pendiente"}</span>
                        {" \u2014 "}
                        <span>{patient.entidadFinanciadora?.trim() || "Financiación no indicada"}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : quickText.trim() ? (
                <InlineNotice variant="info">
                  Se usará interpretación heurística al convertir.
                </InlineNotice>
              ) : null}
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
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">2º cirujano (opcional)</span>
            <input
              type="text"
              value={secondSurgeonName}
              onChange={(e) => setSecondSurgeonName(e.target.value)}
              placeholder="Nombre del otro cirujano o endoscopista"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              list="second-surgeon-list"
            />
            <datalist id="second-surgeon-list">
              {otherSurgeons.map((u) => (
                <option key={u.id} value={u.name} />
              ))}
            </datalist>
          </label>
        </div>
        {over && (
          <InlineNotice variant="warning" className="mb-4 font-medium">
            Tiempo necesario: {currentTotal} min · reservado: {totalReserved} min. Se intentará ampliación automática
            {slotsContext && expansionPreview.canEstimate ? ` (+${expansionPreview.neededSlots} hueco(s))` : ""} al guardar.
            <span className="block text-xs font-normal">
              El tiempo introducido supera el bloque reservado.
            </span>
            {onRequestExpandReservation && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleExpandReservation}
                  disabled={expandingReservation}
                  className="rounded border border-[var(--ribera-red)] bg-[var(--ribera-red)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {expandingReservation ? "Ampliando..." : "Ampliar automáticamente"}
                </button>
                <span className="mt-1 block text-[11px] font-normal text-amber-900/90">
                  El sistema ampliará el siguiente hueco disponible.
                </span>
              </div>
            )}
          </InlineNotice>
        )}
        {over && slotsContext && !expansionPreview.canEstimate && (
          <InlineNotice variant="error" className="mb-4 font-medium">
            No hay hueco consecutivo suficiente en este turno para ampliar la reserva.
          </InlineNotice>
        )}
        {showWideRemainder && (
          <InlineNotice variant="warning" className="mb-4">
            <span className="font-semibold">Holgura amplia:</span> quedan unos{" "}
            <strong>{remainderMinutes} min</strong> sin usar dentro del bloque reservado. Puede valorar otro procedimiento
            corto o revisar el rango reservado si sobra mucho tiempo.
          </InlineNotice>
        )}
        {!over && remainderMinutes > 0 && !showWideRemainder && (
          <InlineNotice variant="info" className="mb-4">
            Este bloque tiene tiempo no utilizado (~{remainderMinutes} min).
          </InlineNotice>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {(pendingRowsCount > 0 || nonEmptyRowsCount === 0) && (
            <InlineNotice variant={nonEmptyRowsCount === 0 ? "info" : "warning"} className="mb-2">
              {nonEmptyRowsCount === 0
                ? "Puede guardar el bloque aunque no haya pacientes. Quedará reservado para completar después."
                : `Hay ${pendingRowsCount} fila(s) pendientes. Son obligatorios procedimiento, financiación y recursos limitados.`}
            </InlineNotice>
          )}
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
                  <StatusBadge
                    tone={p.procedure?.trim() && p.entidadFinanciadora?.trim() && (resourceSelections[index]?.length ?? 0) > 0 ? "success" : "warning"}
                  >
                    {p.procedure?.trim() && p.entidadFinanciadora?.trim() && (resourceSelections[index]?.length ?? 0) > 0
                      ? "Completo"
                      : "Pendiente"}
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
                  />
                </label>
                <label className="rounded-lg bg-amber-50/60 p-2">
                  <span className="block text-sm font-semibold text-gray-800">Entidad financiadora (Obligatorio)</span>
                  <input
                    type="text"
                    value={p.entidadFinanciadora ?? ""}
                    onChange={(e) => updatePatient(index, "entidadFinanciadora", e.target.value)}
                    placeholder="Ej. Mutua, Privado, SAS..."
                    className="mt-1 w-full rounded border border-amber-300 px-3 py-2 text-sm"
                    ref={(el) => {
                      fundingRefs.current[index] = el;
                    }}
                  />
                  {(submitAttempted || p.entidadFinanciadora?.trim()) && !p.entidadFinanciadora?.trim() && (
                    <p className="mt-1 text-xs text-rose-700">Selecciona la financiación.</p>
                  )}
                </label>
                <label className="sm:col-span-2 rounded-lg bg-amber-50/60 p-2">
                  <span className="block text-sm font-semibold text-gray-800">Procedimiento (Obligatorio)</span>
                  <input
                    type="text"
                    value={p.procedure ?? ""}
                    onChange={(e) => updatePatient(index, "procedure", e.target.value)}
                    className="mt-1 w-full rounded border border-amber-300 px-3 py-2 text-sm"
                    ref={(el) => {
                      procedureRefs.current[index] = el;
                    }}
                  />
                  {(submitAttempted || p.procedure?.trim()) && !p.procedure?.trim() && (
                    <p className="mt-1 text-xs text-rose-700">Selecciona el procedimiento.</p>
                  )}
                </label>
                <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
                  <p className="text-sm font-semibold text-gray-800">Recursos limitados (Obligatorio)</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {SOLICITUD_RECURSOS_OPTIONS.map((opt, optIndex) => {
                      const selected = resourceSelections[index]?.includes(opt.id) ?? false;
                      return (
                        <label key={opt.id} className="inline-flex items-center gap-2 rounded border border-amber-100 bg-white px-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => updateResourceSelection(index, opt.id)}
                            ref={(el) => {
                              if (optIndex === 0) resourceRefs.current[index] = el;
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                  {(submitAttempted || (resourceSelections[index]?.length ?? 0) > 0) && (resourceSelections[index]?.length ?? 0) === 0 && (
                    <p className="mt-1 text-xs text-rose-700">Selecciona los recursos necesarios.</p>
                  )}
                </div>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Ingreso o ambulatorio</span>
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
                  <span className="block text-sm font-medium text-gray-700">Tipo de anestesia</span>
                  <select
                    value={p.anesthesiaType ?? ""}
                    onChange={(e) => updatePatient(index, "anesthesiaType", e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Seleccione</option>
                    {ANESTHESIA_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="block text-sm font-medium text-gray-700">Tiempo estimado (min)</span>
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
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="block text-sm font-medium text-gray-700">Notas</span>
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
          {error && (
            <InlineNotice variant="error" role="alert">
              {error}
            </InlineNotice>
          )}
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>Pacientes en formulario: <strong>{patients.length}</strong></span>
              <span>Completos para guardar: <strong>{validRowsCount}</strong></span>
              <span>Necesario: <strong>{currentTotal}</strong> min</span>
              <span>Ampliación automática: <strong>{over ? `+${expansionPreview.neededSlots} hueco(s)` : "+0 huecos"}</strong></span>
              <span>Tiempo libre: <strong>~{remainderMinutes}</strong> min</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <button
              type="submit"
              className="btn-ribera-primary min-h-11 px-6 text-base shadow-md shadow-slate-900/10"
              disabled={saving}
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
