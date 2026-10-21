/**
 * Turno y quirófano habitual como sugerencia.
 * Ninguna función de este módulo escribe una reserva.
 */

export const TURNO_INFERIDO = "TURNO_INFERIDO" as const;
export const QUIROFANO_INFERIDO = "QUIROFANO_INFERIDO" as const;

export type HabitFlag = typeof TURNO_INFERIDO | typeof QUIROFANO_INFERIDO;
export type HabitShift = "morning" | "afternoon";

export interface SurgeonHabitCatalogEntry {
  nameToken: string;
  shift: HabitShift;
  resourceId?: string;
}

export const SURGEON_HABIT_CATALOG: readonly SurgeonHabitCatalogEntry[] = [
  { nameToken: "muel", shift: "morning" },
  { nameToken: "huescar", shift: "morning", resourceId: "Q2" },
  { nameToken: "corona", shift: "morning" },
  { nameToken: "blanco", shift: "afternoon" },
];

export interface SavedSurgeonHabit {
  defaultShift: HabitShift | null;
  preferredResourceId: string | null;
  active: boolean;
}

export interface HabitSuggestion {
  shift: HabitShift | null;
  resourceId: string | null;
  flags: HabitFlag[];
}

export function normalizeSurgeonToken(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function catalogHabitForName(name: string | null | undefined): SurgeonHabitCatalogEntry | null {
  if (!name) return null;
  const tokens = new Set(normalizeSurgeonToken(name));
  return SURGEON_HABIT_CATALOG.find((entry) => tokens.has(entry.nameToken)) ?? null;
}

export function suggestSurgeonHabit(input: {
  explicitShift?: HabitShift | "unknown" | null;
  explicitResourceId?: string | null;
  surgeonName?: string | null;
  saved?: SavedSurgeonHabit | null;
}): HabitSuggestion {
  const explicitShift = input.explicitShift === "morning" || input.explicitShift === "afternoon"
    ? input.explicitShift
    : null;
  const explicitResource = input.explicitResourceId && input.explicitResourceId !== "unknown"
    ? input.explicitResourceId
    : null;
  const flags: HabitFlag[] = [];
  let shift = explicitShift;
  let resourceId = explicitResource;
  const saved = input.saved?.active ? input.saved : null;
  const catalog = saved ? null : catalogHabitForName(input.surgeonName);

  if (!shift) {
    const inferred = saved?.defaultShift ?? catalog?.shift ?? null;
    if (inferred) {
      shift = inferred;
      flags.push(TURNO_INFERIDO);
    }
  }
  if (!resourceId) {
    const inferred = saved?.preferredResourceId ?? catalog?.resourceId ?? null;
    if (inferred) {
      resourceId = inferred;
      flags.push(QUIROFANO_INFERIDO);
    }
  }
  return { shift, resourceId, flags };
}

export function missingFieldsLeaveShiftPending(missingFields: string[] | undefined): boolean {
  if (!missingFields || missingFields.length !== 1) return false;
  return /turno/i.test(missingFields[0] ?? "");
}

export interface PreviewHabitBlock {
  shift: HabitShift | "unknown";
  resourceId: string;
  detectedSurgeon?: string;
  hasIssue: boolean;
  reviewStatus: "valid" | "review" | "ignored";
  inferences?: HabitFlag[];
  suggestionNote?: string;
}

export function annotateInferredHabits<T extends PreviewHabitBlock>(
  blocks: T[],
  savedByName: Array<SavedSurgeonHabit & { name: string }>,
): Array<T & { inferences: HabitFlag[]; suggestionNote?: string }> {
  return blocks.map((block) => {
    const saved = savedByName.find((row) => row.name === block.detectedSurgeon) ?? null;
    const suggestion = suggestSurgeonHabit({
      explicitShift: block.shift,
      explicitResourceId: block.resourceId,
      surgeonName: block.detectedSurgeon,
      saved,
    });
    if (suggestion.flags.length === 0) return { ...block, inferences: [] };
    const notes = suggestion.flags.map((flag) => {
      if (flag === TURNO_INFERIDO) return `TURNO_INFERIDO: ${suggestion.shift === "afternoon" ? "tarde" : "mañana"}`;
      return `QUIROFANO_INFERIDO: ${suggestion.resourceId}`;
    });
    return {
      ...block,
      hasIssue: true,
      reviewStatus: block.reviewStatus === "ignored" ? "ignored" : "review",
      inferences: suggestion.flags,
      suggestionNote: `${notes.join(" · ")}. Sugerencia, no se graba sola.`,
    };
  });
}
