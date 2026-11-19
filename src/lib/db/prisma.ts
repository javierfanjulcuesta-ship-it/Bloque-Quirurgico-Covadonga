/**
 * Cliente Prisma. En demostración aislada no se construye: así una DATABASE_URL
 * heredada de otro proyecto no abre ninguna conexión.
 */

import { PrismaClient } from "@prisma/client";

import { isIsolatedDemoRef } from "@/lib/isolatedDemoBranch";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseDisabled(): boolean {
  // Acceso directo a process.env para que el build de la rama demo lo deje fijado
  // aunque el proyecto de Vercel no defina esas variables.
  return (
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo" ||
    process.env.QXFLOW_ISOLATED_DEMO === "true" ||
    isIsolatedDemoRef(process.env.VERCEL_GIT_COMMIT_REF)
  );
}

function getPrisma(): PrismaClient {
  if (databaseDisabled()) {
    throw new Error("Base de datos deshabilitada en modo demostración aislado");
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    if (property === "then") return undefined;
    const client = getPrisma();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

if (!databaseDisabled() && process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = getPrisma();
}
