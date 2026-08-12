import type { Prisma, PrismaClient, UserRole } from "@prisma/client";

const USER_LIFECYCLE_LOCK_KEY = 731_904_217;
const MANAGER_ROLES: UserRole[] = ["GESTOR", "GESTOR_ANESTESISTA"];

type DbClient = PrismaClient;
type TxClient = Prisma.TransactionClient;

export type UserLifecycleResult =
  | { ok: true; alreadyDeleted?: boolean }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_INACTIVE" | "ALREADY_ACTIVE" | "LAST_MANAGER" };

function serializeDetails(details: Record<string, unknown> | null | undefined): string | null {
  return details ? JSON.stringify(details) : null;
}

async function lockLifecycle(tx: TxClient): Promise<void> {
  await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(${USER_LIFECYCLE_LOCK_KEY})
  `;
}

async function wouldRemoveLastManager(tx: TxClient, role: UserRole, isCurrentlyActive: boolean): Promise<boolean> {
  if (!isCurrentlyActive || !MANAGER_ROLES.includes(role)) return false;
  const activeManagers = await tx.user.count({
    where: {
      role: { in: MANAGER_ROLES },
      approved: true,
      deletedAt: null,
    },
  });
  return activeManagers <= 1;
}

async function audit(
  tx: TxClient,
  params: { userId: string; actorUserId: string | null; eventType: string; detailsJson?: Record<string, unknown> | null },
): Promise<void> {
  await tx.userAuditEvent.create({
    data: {
      userId: params.userId,
      actorUserId: params.actorUserId,
      eventType: params.eventType,
      detailsJson: serializeDetails(params.detailsJson),
    },
  });
}

export async function deactivateUser(
  db: DbClient,
  params: { targetUserId: string; actorUserId: string },
): Promise<UserLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockLifecycle(tx);
    const user = await tx.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, role: true, approved: true, deletedAt: true },
    });
    if (!user) return { ok: false, code: "NOT_FOUND" } as const;
    if (!user.approved || user.deletedAt) return { ok: false, code: "ALREADY_INACTIVE" } as const;
    if (await wouldRemoveLastManager(tx, user.role, true)) return { ok: false, code: "LAST_MANAGER" } as const;

    await tx.user.update({ where: { id: user.id }, data: { approved: false } });
    await audit(tx, {
      userId: user.id,
      actorUserId: params.actorUserId,
      eventType: "USER_DEACTIVATED",
      detailsJson: { previousApproved: true },
    });
    return { ok: true } as const;
  });
}

export async function reactivateUser(
  db: DbClient,
  params: { targetUserId: string; actorUserId: string },
): Promise<UserLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockLifecycle(tx);
    const user = await tx.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, approved: true, deletedAt: true },
    });
    if (!user) return { ok: false, code: "NOT_FOUND" } as const;
    if (user.approved && !user.deletedAt) return { ok: false, code: "ALREADY_ACTIVE" } as const;

    await tx.user.update({
      where: { id: user.id },
      data: { approved: true, deletedAt: null, deletedByUserId: null, deletionReason: null },
    });
    await audit(tx, {
      userId: user.id,
      actorUserId: params.actorUserId,
      eventType: "USER_REACTIVATED",
      detailsJson: { restoredFromSoftDelete: user.deletedAt != null },
    });
    return { ok: true } as const;
  });
}

export async function softDeleteUser(
  db: DbClient,
  params: { targetUserId: string; actorUserId: string },
): Promise<UserLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockLifecycle(tx);
    const user = await tx.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, role: true, approved: true, deletedAt: true },
    });
    if (!user) return { ok: false, code: "NOT_FOUND" } as const;
    if (user.deletedAt) return { ok: true, alreadyDeleted: true } as const;
    if (await wouldRemoveLastManager(tx, user.role, user.approved)) return { ok: false, code: "LAST_MANAGER" } as const;

    await tx.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        approved: false,
        deletedByUserId: params.actorUserId,
      },
    });
    await audit(tx, {
      userId: user.id,
      actorUserId: params.actorUserId,
      eventType: "USER_DELETED",
      detailsJson: { soft: true, previousApproved: user.approved },
    });
    return { ok: true } as const;
  });
}
