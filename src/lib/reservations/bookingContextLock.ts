import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Shift } from "@/lib/types";

export interface SchedulingContextKey {
  date: string;
  resourceId: string;
  shift: Shift;
}

export function schedulingContextLockKey(context: SchedulingContextKey): string {
  return `qxflow:booking:${context.date}:${context.resourceId}:${context.shift}`;
}

/**
 * Serializa dentro de PostgreSQL todas las mutaciones que pueden cambiar la ocupación
 * de un mismo (fecha, recurso, turno). El lock vive solo hasta el COMMIT/ROLLBACK.
 *
 * hashtext puede colisionar, pero una colisión solo provoca serialización adicional;
 * nunca permite dos escrituras incompatibles.
 */
export async function acquireSchedulingContextLock(
  tx: Prisma.TransactionClient,
  context: SchedulingContextKey,
): Promise<void> {
  const key = schedulingContextLockKey(context);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Ejecuta una mutación de ocupación bajo una transacción y un advisory lock de contexto.
 * Todas las comprobaciones de colisión deben ocurrir DESPUÉS de adquirir este lock.
 */
export async function withSchedulingContextLock<T>(
  context: SchedulingContextKey,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await acquireSchedulingContextLock(tx, context);
      return callback(tx);
    },
    {
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}
