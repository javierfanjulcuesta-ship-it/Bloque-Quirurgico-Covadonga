/**
 * Restablecer la demo: limpia sesión y todos los datos persistidos por la app
 * para dejar un estado coherente y poder volver a demostrar desde cero.
 * No restaura datos iniciales; deja la app vacía y usable.
 */

const SESSION_KEY = "bloque_quirurgico_v2_session_user";

/** Todas las claves de localStorage que usa la aplicación en modo DEMO. */
export const DEMO_LOCAL_STORAGE_KEYS = [
  "bloque_quirurgico_mensajes_gestor",
  "bloque_quirurgico_notificaciones",
  "bloque_quirurgico_pacientes_no_apto",
  "bloque_quirurgico_recordatorio_semana",
  "bloque_quirurgico_huecos_liberados_semana",
  "bloque_quirurgico_festivos",
  "bloque_quirurgico_reservations",
  "bloque_quirurgico_anesthetist_unavailability",
  "bloque_quirurgico_v2_perfiles",
  "bloque_quirurgico_anesthetist_assignments",
] as const;

/**
 * Limpia la sesión actual (sessionStorage) y todos los datos de la demo en localStorage.
 * No restaura datos iniciales: deja reservas, mensajes, notificaciones, perfiles,
 * asignaciones de anestesistas y no disponibilidad en estado vacío.
 * La app queda usable: el usuario debe volver a la pantalla de selección de usuario
 * y elegir un usuario para entrar de nuevo.
 */
export function resetDemoStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    DEMO_LOCAL_STORAGE_KEYS.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignorar fallos por clave individual
      }
    });
  } catch {
    // ignorar fallo global
  }
}
