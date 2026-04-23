import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, addSessionCookieToResponse } from "@/lib/auth/session";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_EMAIL = "demo@qxflow.local";
const DEMO_NAME = "Usuario Demo QxFlow";
const DEMO_PASSWORD = "QxFlowDemo2026!";

/**
 * Sólo permitido cuando se cumplen TODAS las condiciones:
 *  - NODE_ENV !== "production"
 *  - Se ha fijado explícitamente ALLOW_DEV_UTILITIES=1 en el entorno
 * Cerrojo doble contra despliegues hospitalarios que olviden ajustar NODE_ENV.
 */
function devUtilitiesEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.ALLOW_DEV_UTILITIES === "1";
}

export async function POST() {
  if (!devUtilitiesEnabled()) {
    return NextResponse.json({ error: "No permitido." }, { status: 404 });
  }

  try {
    let dbUser = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true, email: true, name: true, approved: true, role: true },
    });

    if (!dbUser) {
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      dbUser = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          name: DEMO_NAME,
          role: "GESTOR",
          approved: true,
          passwordHash,
        },
        select: { id: true, email: true, name: true, approved: true, role: true },
      });
    }

    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: "gestor",
      approved: dbUser.approved,
    };

    const token = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      approved: user.approved,
    });

    const response = NextResponse.json({ ok: true, user });
    return addSessionCookieToResponse(response, token);
  } catch (err) {
    console.error("[auth/dev-login]", err);
    return NextResponse.json({ error: "No se pudo iniciar sesión demo." }, { status: 500 });
  }
}

