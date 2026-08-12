/** POST /api/users/[id]/regenerate-password */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporaryPassword";
import { rotateAdministrativeCredential } from "@/lib/users/administrativeCredentialRotation";

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
      select: { id: true, passwordHash: true, deletedAt: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.deletedAt != null) {
      return NextResponse.json({ error: "El usuario está eliminado del directorio" }, { status: 400 });
    }

    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    const rotated = await rotateAdministrativeCredential(prisma, {
      userId: id,
      expectedPasswordHash: user.passwordHash,
      nextPasswordHash: passwordHash,
      actorUserId: session!.userId,
    });

    if (!rotated.ok) {
      return NextResponse.json(
        {
          error: "La contraseña cambió durante la solicitud. Vuelva a intentarlo para generar una nueva credencial.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, tempPassword });
  } catch (err) {
    console.error("[regenerate-password]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Error al regenerar contraseña" }, { status: 500 });
  }
}
