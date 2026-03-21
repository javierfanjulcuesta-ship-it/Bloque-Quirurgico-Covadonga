/**
 * Utilidades seguras para lectura de localStorage/sessionStorage.
 * Evita que datos corruptos o JSON inválido rompan la app.
 */

/**
 * Parsea una cadena como JSON o devuelve el valor por defecto.
 * Nunca lanza: ante cualquier error (JSON inválido, circular, etc.) devuelve fallback.
 */
export function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}
