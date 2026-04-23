/**
 * UI de casos en asignación de anestesistas: tono SESPA/privado y procedimiento principal.
 * Usa la misma fuente que el resto de la app: entidadFinanciadora / isSespa / isPrivateFunding.
 */

import { classifyFunding } from "@/lib/patientInsurance";

/** Tono visual único por celda de asignación (un solo color de fondo). */
export type CaseFundingTone = "sespa" | "private" | "mutual" | "neutral";

/**
 * Clasifica el caso agregado de un turno según pacientes.
 * Precedencia (explícita): si existe algún paciente SESPA → sespa;
 * si no, si existe alguno con financiación privada → private;
 * en caso contrario → neutral (p. ej. solo SNS u otras entidades sin “privado” en texto).
 */
export function caseFundingToneFromPatients(patients: Array<{ entidadFinanciadora?: string }> | undefined): CaseFundingTone {
  if (!patients?.length) return "neutral";
  if (patients.some((p) => classifyFunding(p.entidadFinanciadora) === "sespa")) return "sespa";
  if (patients.some((p) => classifyFunding(p.entidadFinanciadora) === "private")) return "private";
  if (patients.some((p) => classifyFunding(p.entidadFinanciadora) === "mutual")) return "mutual";
  return "neutral";
}

/** Procedimiento principal: primer paciente por order (o 0) en la lista. */
export function primaryProcedureFromPatients(patients: Array<{ procedure?: string; order?: number }> | undefined): string {
  if (!patients?.length) return "—";
  const sorted = [...patients].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const proc = sorted[0]?.procedure?.trim();
  return proc || "—";
}
