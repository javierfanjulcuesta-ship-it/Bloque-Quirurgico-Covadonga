/**
 * POST /api/users/[id]/regenerate-password
 * Genera nueva contraseña temporal para el usuario (usuarios de prueba).
 * No envía email. Requiere user:create.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

const TEMP_PASSWORD_LENGTH = 10;
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(): string {
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true, tempPassword });
  } catch (err) {
    console.error("[regenerate-password]", err);
    return NextResponse.json(
      { error: "Error al regenerar contraseña" },
      { status: 500 }
    );
  }
}
