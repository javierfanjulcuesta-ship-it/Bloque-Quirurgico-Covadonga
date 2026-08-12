/**
 * Configuración de la aplicación.
 * modoDemo = true  → usuarios mock, localStorage, sin contraseña (solo en NODE_ENV=development).
 * modoDemo = false → backend real: API, base de datos, autenticación real.
 *
 * En build/producción el modo demo nunca se activa aunque NEXT_PUBLIC_DEMO_MODE no sea "false".
 * Piloto real: NEXT_PUBLIC_DEMO_MODE=false en .env (y en desarrollo también si quieres API real).
 *
 * useRealReservationsApi: true = leer/escribir reservas vía API; false = localStorage.
 * Fuera de desarrollo se fuerza siempre la API real: una variable NEXT_PUBLIC_USE_REAL_API=false
 * mal configurada no puede degradar producción a almacenamiento local del navegador.
 * En desarrollo, el override NEXT_PUBLIC_USE_REAL_API=true|false sigue disponible.
 */
const demoModeRequested = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const modoDemo = demoModeRequested && process.env.NODE_ENV === "development";

export function resolveUseRealReservationsApi({
  nodeEnv,
  demoMode,
  useRealApiEnv,
}: {
  nodeEnv: string | undefined;
  demoMode: boolean;
  useRealApiEnv: string | undefined;
}) {
  if (nodeEnv !== "development") return true;
  return useRealApiEnv === "true" ? true : useRealApiEnv === "false" ? false : !demoMode;
}

export const useRealReservationsApi = resolveUseRealReservationsApi({
  nodeEnv: process.env.NODE_ENV,
  demoMode: modoDemo,
  useRealApiEnv: process.env.NEXT_PUBLIC_USE_REAL_API,
});

/** Buzón principal del gestor: jfanjul@riberacare.com (Outlook / Microsoft 365) */
export const GESTOR_EMAIL = process.env.GESTOR_EMAIL ?? "jfanjul@riberacare.com";
