export const LOCAL_NO_ANESTHETIST = "Local (no precisa anestesista)";

function normalizeAnesthesiaType(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Regla clínica-operativa explícita: este tipo de anestesia no requiere
 * anestesiólogo, consulta preanestésica ni declaración APTO/NO APTO.
 */
export function isLocalWithoutAnesthetist(value: string | null | undefined): boolean {
  return normalizeAnesthesiaType(value) === normalizeAnesthesiaType(LOCAL_NO_ANESTHETIST);
}
