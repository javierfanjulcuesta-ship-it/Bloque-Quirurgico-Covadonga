/**
 * Configuración de la aplicación.
 *
 * Modos soportados:
 * - desarrollo DEMO legado: usuarios mock + localStorage, solo en NODE_ENV=development.
 * - isolated-demo: demostración online explícita, localStorage y sin API real.
 * - modo real: backend/API/base de datos/autenticación reales.
 *
 * `isolated-demo` nunca se activa por omisión: requiere
 * NEXT_PUBLIC_DEPLOYMENT_MODE=isolated-demo.
 */

export function resolveDemoMode({
  nodeEnv,
  deploymentMode,
  legacyDemoEnv,
}: {
  nodeEnv: string | undefined;
  deploymentMode: string | undefined;
  legacyDemoEnv: string | undefined;
}) {
  if (deploymentMode === "isolated-demo") return true;
  const legacyDemoRequested = legacyDemoEnv !== "false";
  return legacyDemoRequested && nodeEnv === "development";
}

export const isolatedDemoMode =
  process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo";

export const modoDemo = resolveDemoMode({
  nodeEnv: process.env.NODE_ENV,
  deploymentMode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
  legacyDemoEnv: process.env.NEXT_PUBLIC_DEMO_MODE,
});

export function resolveUseRealReservationsApi({
  nodeEnv,
  demoMode,
  deploymentMode,
  useRealApiEnv,
}: {
  nodeEnv: string | undefined;
  demoMode: boolean;
  deploymentMode?: string | undefined;
  useRealApiEnv: string | undefined;
}) {
  // Frontera cliente del DEMO aislado: nunca usar API real, incluso en build production.
  if (deploymentMode === "isolated-demo") return false;

  // En cualquier otro build no-development se conserva el fail-safe histórico:
  // la aplicación real nunca degrada a localStorage por una variable pública errónea.
  if (nodeEnv !== "development") return true;

  return useRealApiEnv === "true"
    ? true
    : useRealApiEnv === "false"
      ? false
      : !demoMode;
}

export const useRealReservationsApi = resolveUseRealReservationsApi({
  nodeEnv: process.env.NODE_ENV,
  demoMode: modoDemo,
  deploymentMode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
  useRealApiEnv: process.env.NEXT_PUBLIC_USE_REAL_API,
});

/**
 * Buzón principal del gestor. Se configura por entorno y nunca se incluye una
 * dirección real como fallback en el repositorio. Si falta, las superficies que
 * lo usan deben degradar de forma segura sin inventar un destinatario.
 */
export const GESTOR_EMAIL = process.env.GESTOR_EMAIL?.trim() ?? "";
