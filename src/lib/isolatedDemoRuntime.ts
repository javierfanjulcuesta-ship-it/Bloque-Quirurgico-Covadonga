import { isIsolatedDemoRef } from "./isolatedDemoBranch";

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key];
}

/**
 * Verdadero cuando este proceso no debe abrir Prisma ni atender /api.
 * Cubre la variable explícita, el valor incorporado en el build y la rama demo en Vercel.
 */
export function isIsolatedDemoRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    envValue(env, "NEXT_PUBLIC_DEPLOYMENT_MODE") === "isolated-demo" ||
    envValue(env, "QXFLOW_ISOLATED_DEMO") === "true" ||
    isIsolatedDemoRef(envValue(env, "VERCEL_GIT_COMMIT_REF"))
  );
}
