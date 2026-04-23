import { getSlots } from "@/lib/utils";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function inferCountFromText(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  const explicit = normalized.match(/\b(\d{1,2})\s*(?:proc|proced|procedimientos|casos|pacientes?)\b/);
  if (explicit) {
    const n = parseInt(explicit[1] ?? "0", 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const chunks = text
    .split(/\/\/|\n|,|;|\/| - /g)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
  return Math.min(chunks.length, 4);
}

interface SlotSpanPresetRule {
  key: string;
  label: string;
  span: number;
  patterns: RegExp[];
}

const SLOT_SPAN_PRESETS: SlotSpanPresetRule[] = [
  { key: "HOLEP", label: "HOLEP", span: 3, patterns: [/\bholep\b/i] },
  { key: "LCA", label: "LCA", span: 2, patterns: [/\blca\b/i] },
  { key: "MC", label: "MC", span: 2, patterns: [/\bmc\b/i] },
  { key: "PRP", label: "PRP", span: 1, patterns: [/\bprp\b/i] },
  { key: "FACO", label: "FACO", span: 1, patterns: [/\bfacos?\b/i, /\bfacoemuls/i] },
];

export interface ImportSlotSpanDecision {
  slotSpan: number;
  source: "manual" | "preset" | "heuristic";
  presetKey?: string;
  presetLabel?: string;
}

function inferHeuristicSpan(params: {
  inferredProcedures?: string[];
  sourceText?: string;
  maxSlots: number;
}): number {
  const procedures = (params.inferredProcedures ?? []).filter((p) => p.trim().length >= 3).length;
  const inferredCount = procedures > 0 ? procedures : inferCountFromText(params.sourceText ?? "");
  if (inferredCount <= 1) return 1;
  if (inferredCount === 2) return Math.min(2, params.maxSlots);
  return Math.min(3, params.maxSlots);
}

export function inferImportSlotSpanDecision(params: {
  shift: "morning" | "afternoon";
  inferredProcedures?: string[];
  sourceText?: string;
  explicitSpan?: number;
}): ImportSlotSpanDecision {
  const maxSlots = getSlots(params.shift).length;
  if (Number.isInteger(params.explicitSpan) && (params.explicitSpan as number) > 0) {
    return {
      slotSpan: Math.min(maxSlots, params.explicitSpan as number),
      source: "manual",
    };
  }

  const text = `${params.inferredProcedures?.join(" ") ?? ""} ${params.sourceText ?? ""}`.trim();
  for (const preset of SLOT_SPAN_PRESETS) {
    if (preset.patterns.some((p) => p.test(text))) {
      return {
        slotSpan: Math.min(maxSlots, preset.span),
        source: "preset",
        presetKey: preset.key,
        presetLabel: preset.label,
      };
    }
  }

  return {
    slotSpan: inferHeuristicSpan({
      inferredProcedures: params.inferredProcedures,
      sourceText: params.sourceText,
      maxSlots,
    }),
    source: "heuristic",
  };
}

export function inferImportSlotSpan(params: {
  shift: "morning" | "afternoon";
  inferredProcedures?: string[];
  sourceText?: string;
  explicitSpan?: number;
}): number {
  return inferImportSlotSpanDecision(params).slotSpan;
}
