/** POST /api/users/[id]/regenerate-password */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporaryPassword";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.deletedAt != null) {
      return NextResponse.json({ error: "El usuario está eliminado del directorio" }, { status: 400 });
    }

    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.userAuditEvent.create({
        data: {
          userId: id,
          eventType: "USER_PASSWORD_REGENERATED",
          actorUserId: session!.userId,
          detailsJson: JSON.stringify({ temporaryCredentialIssued: true }),
        },
      });
    });

    return NextResponse.json({ ok: true, tempPassword });
  } catch (err) {
    console.error("[regenerate-password]", err);
    return NextResponse.json({ error: "Error al regenerar contraseña" }, { status: 500 });
  }
}
