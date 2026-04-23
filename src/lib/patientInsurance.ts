/**
 * Detección de tipo de financiación en pacientes.
 * entidadFinanciadora (frontend) / insuranceType (API) = "SESPA" exacto (case-insensitive).
 */

export function isSespa(entidadFinanciadora: string | undefined): boolean {
  return !!(entidadFinanciadora?.trim() && /^sespa$/i.test(entidadFinanciadora.trim()));
}

export function isPrivateFunding(entidadFinanciadora: string | undefined): boolean {
  return !!(entidadFinanciadora?.trim() && /privad/i.test(entidadFinanciadora.trim()));
}

/** true si la reserva tiene al menos un paciente SESPA */
export function reservationHasSespa(r: { patients?: Array<{ entidadFinanciadora?: string }> }): boolean {
  return r.patients?.some((p) => isSespa(p.entidadFinanciadora)) ?? false;
}
