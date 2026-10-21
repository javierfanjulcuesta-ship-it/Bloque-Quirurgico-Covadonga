/**
 * Datos de cupo, separados de la validación.
 * La comprobación del PUT solo recibe el número ya resuelto.
 */

export const DEFAULT_MAX_SIMULTANEOUS_OR = 2;

export interface AnesthetistCapacityCatalogEntry {
  /** Token del apellido normalizado, sin acentos. */
  nameToken: string;
  maxSimultaneousOr: number;
}

export const ANESTHETIST_CAPACITY_CATALOG: readonly AnesthetistCapacityCatalogEntry[] = [
  { nameToken: "carcelen", maxSimultaneousOr: 3 },
  { nameToken: "fanjul", maxSimultaneousOr: 3 },
  { nameToken: "dura", maxSimultaneousOr: 2 },
];

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function catalogMaxForName(name: string | null | undefined): number | null {
  if (!name) return null;
  const tokens = new Set(normalizePersonName(name).split(/[^a-z0-9]+/).filter(Boolean));
  const match = ANESTHETIST_CAPACITY_CATALOG.find((entry) => tokens.has(entry.nameToken));
  return match?.maxSimultaneousOr ?? null;
}

/** La fila guardada gana. Si no hay fila, se usa el catálogo y, si tampoco, el defecto. */
export function effectiveMaxSimultaneousOr(
  profileMax: number | null | undefined,
  name: string | null | undefined,
): number {
  if (typeof profileMax === "number" && Number.isInteger(profileMax) && profileMax > 0) return profileMax;
  return catalogMaxForName(name) ?? DEFAULT_MAX_SIMULTANEOUS_OR;
}
