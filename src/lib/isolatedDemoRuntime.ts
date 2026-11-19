import { isIsolatedDemoRef } from "./isolatedDemoBranch";

/**
 * Verdadero cuando este proceso no debe abrir Prisma ni atender /api.
 * Cubre la variable explícita, el valor incorporado en el build y la rama demo en Vercel.
 */
export function isIsolatedDemoRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo" ||
    env.QXFLOW_ISOLATED_DEMO === "true" ||
    isIsolatedDemoRef(env.VERCEL_GIT_COMMIT_REF)
  );
}
