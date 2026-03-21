/**
 * Configuración de la aplicación.
 * modoDemo = true  → usuarios mock, localStorage, sin contraseña.
 * modoDemo = false → backend real: API, base de datos, autenticación real.
 *
 * Piloto real: establecer NEXT_PUBLIC_DEMO_MODE=false en las variables de entorno.
 *
 * useRealReservationsApi: true = leer/escribir reservas vía API; false = localStorage.
 * Por defecto sigue a modoDemo (API cuando !modoDemo).
 * Override: NEXT_PUBLIC_USE_REAL_API=true|false
 */
export const modoDemo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const useRealApiEnv = process.env.NEXT_PUBLIC_USE_REAL_API;
export const useRealReservationsApi =
  useRealApiEnv === "true" ? true : useRealApiEnv === "false" ? false : !modoDemo;

/** Buzón principal del gestor: jfanjul@riberacare.com (Outlook / Microsoft 365) */
export const GESTOR_EMAIL = process.env.GESTOR_EMAIL ?? "jfanjul@riberacare.com";
