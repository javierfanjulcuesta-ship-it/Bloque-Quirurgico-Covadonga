/**
 * Detección de tipo de financiación en pacientes.
 * entidadFinanciadora (frontend) / insuranceType (API) = "SESPA" exacto (case-insensitive).
 */

function normalizeFunding(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export type FundingCategory = "sespa" | "private" | "mutual" | "other";

export function classifyFunding(entidadFinanciadora: string | undefined): FundingCategory {
  const normalized = normalizeFunding(entidadFinanciadora);
  if (!normalized) return "other";
  if (normalized === "sespa") return "sespa";
  if (/privad|private|autopago|particular/.test(normalized)) return "private";
  if (/mutua|mutual|asegur|mapfre|adeslas|asisa|dkv|sanitas|axa|fremap/.test(normalized)) return "mutual";
  return "other";
}

export function isSespa(entidadFinanciadora: string | undefined): boolean {
  return classifyFunding(entidadFinanciadora) === "sespa";
}

export function isPrivateFunding(entidadFinanciadora: string | undefined): boolean {
  return classifyFunding(entidadFinanciadora) === "private";
}

export function isMutualFunding(entidadFinanciadora: string | undefined): boolean {
  return classifyFunding(entidadFinanciadora) === "mutual";
}

/** true si la reserva tiene al menos un paciente SESPA */
export function reservationHasSespa(r: { patients?: Array<{ entidadFinanciadora?: string }> }): boolean {
  return r.patients?.some((p) => isSespa(p.entidadFinanciadora)) ?? false;
}
