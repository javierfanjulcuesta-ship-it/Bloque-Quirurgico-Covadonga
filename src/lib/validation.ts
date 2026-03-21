/**
 * Validaciones reutilizables para formularios y datos (demo).
 */

/** Formato básico de email (acepta user@domain o user@domain.tld). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+(\.[^\s@]+)?$/;

export function isValidEmail(value: string): boolean {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

/** Fecha ISO YYYY-MM-DD */
export function isValidISODate(value: string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Número finito y >= 0 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
