import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

const ASSIGNMENT_SNAPSHOT_LOCK_KEY = "qxflow:anesthetist-assignments:snapshot:v1";

export interface AssignmentSnapshotRow {
  date: string;
  shift: "MORNING" | "AFTERNOON";
  assignmentType: "OR" | "PREANESTHESIA";
  resourceId: string;
  anesthetistId: string;
}

export type ReplaceAssignmentSnapshotResult =
  | { ok: true; revision: string }
  | { ok: false; reason: "stale_revision"; currentRevision: string };

function canonical(rows: AssignmentSnapshotRow[]): AssignmentSnapshotRow[] {
  return [...rows].sort((a, b) => {
    const ak = `${a.date}|${a.shift}|${a.assignmentType}|${a.resourceId}|${a.anesthetistId}`;
    const bk = `${b.date}|${b.shift}|${b.assignmentType}|${b.resourceId}|${b.anesthetistId}`;
    return ak.localeCompare(bk);
  });
}

export function assignmentSnapshotRevision(rows: AssignmentSnapshotRow[]): string {
  return createHash("sha256").update(JSON.stringify(canonical(rows))).digest("hex");
}

export async function loadAssignmentSnapshot(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<{ rows: AssignmentSnapshotRow[]; revision: string }> {
  const rows = await client.anesthetistAssignment.findMany({
    select: {
      date: true,
      shift: true,
      assignmentType: true,
      resourceId: true,
      anesthetistId: true,
    },
    orderBy: [{ date: "asc" }, { shift: "asc" }, { assignmentType: "asc" }, { resourceId: "asc" }],
  });
  const normalized = rows as AssignmentSnapshotRow[];
  return { rows: normalized, revision: assignmentSnapshotRevision(normalized) };
}

async function acquireSnapshotLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<Array<{ acquired: number }>>`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtext(${ASSIGNMENT_SNAPSHOT_LOCK_KEY}))
  `;
}

/**
 * Reemplaza el snapshot completo únicamente si sigue correspondiendo a la revisión
 * que el gestor cargó. Dos gestores con la misma fotografía no pueden sobrescribirse:
 * el segundo recibe stale_revision después de que el primero haga commit.
 */
export async function replaceAssignmentSnapshot(
  prisma: PrismaClient,
  expectedRevision: string,
  nextRows: AssignmentSnapshotRow[],
): Promise<ReplaceAssignmentSnapshotResult> {
  return prisma.$transaction(
    async (tx) => {
      await acquireSnapshotLock(tx);
      const current = await loadAssignmentSnapshot(tx);
      if (current.revision !== expectedRevision) {
        return { ok: false, reason: "stale_revision", currentRevision: current.revision } as const;
      }

      await tx.anesthetistAssignment.deleteMany({});
      if (nextRows.length > 0) {
        await tx.anesthetistAssignment.createMany({ data: nextRows });
      }

      return { ok: true, revision: assignmentSnapshotRevision(nextRows) } as const;
    },
    { maxWait: 5_000, timeout: 15_000 },
  );
}
