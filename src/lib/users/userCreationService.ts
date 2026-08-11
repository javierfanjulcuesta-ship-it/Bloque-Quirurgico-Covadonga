import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";

type CreateUserParams = {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  canSespa: boolean;
  actorUserId: string;
};

export type CreateUserResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
        approved: boolean;
        canSespa: boolean;
      };
    }
  | { ok: false; code: "DUPLICATE_EMAIL" };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createUserWithAudit(
  db: PrismaClient,
  params: CreateUserParams,
): Promise<CreateUserResult> {
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: params.email,
          passwordHash: params.passwordHash,
          name: params.name,
          role: params.role,
          approved: true,
          canSespa: params.canSespa,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          approved: true,
          canSespa: true,
        },
      });

      await tx.userAuditEvent.create({
        data: {
          userId: created.id,
          actorUserId: params.actorUserId,
          eventType: "USER_CREATED",
          detailsJson: JSON.stringify({
            targetEmail: created.email,
            targetRole: created.role,
            canSespa: created.canSespa,
          }),
        },
      });

      return created;
    });

    return { ok: true, user };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, code: "DUPLICATE_EMAIL" };
    }
    throw error;
  }
}
