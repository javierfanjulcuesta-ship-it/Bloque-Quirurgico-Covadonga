/**
 * Configuración de la aplicación.
 * modoDemo = true  → usuarios mock, localStorage, sin contraseña (solo en NODE_ENV=development).
 * modoDemo = false → backend real: API, base de datos, autenticación real.
 *
 * En build/producción el modo demo nunca se activa aunque NEXT_PUBLIC_DEMO_MODE no sea "false".
 * Piloto real: NEXT_PUBLIC_DEMO_MODE=false en .env (y en desarrollo también si quieres API real).
 *
 * useRealReservationsApi: true = leer/escribir reservas vía API; false = localStorage.
 * Por defecto sigue a modoDemo (API cuando !modoDemo).
 * Override: NEXT_PUBLIC_USE_REAL_API=true|false
 */
const demoModeRequested = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export const modoDemo = demoModeRequested && process.env.NODE_ENV === "development";

const useRealApiEnv = process.env.NEXT_PUBLIC_USE_REAL_API;
export const useRealReservationsApi =
  useRealApiEnv === "true" ? true : useRealApiEnv === "false" ? false : !modoDemo;

/** Buzón principal del gestor: jfanjul@riberacare.com (Outlook / Microsoft 365) */
export const GESTOR_EMAIL = process.env.GESTOR_EMAIL ?? "jfanjul@riberacare.com";
