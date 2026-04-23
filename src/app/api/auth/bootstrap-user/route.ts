import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOOTSTRAP_USERS = [
  { email: "gestor@qxflow.local", name: "Gestor QxFlow", role: "GESTOR" as const, password: "Qxflow123" },
  { email: "cirujano@qxflow.local", name: "Cirujano QxFlow", role: "CIRUJANO" as const, password: "Qxflow123" },
  { email: "anestesia@qxflow.local", name: "Anestesista QxFlow", role: "ANESTESISTA" as const, password: "Qxflow123" },
];

/**
 * Bootstrap de usuarios de prueba. Cerrojo doble:
 *  - NODE_ENV distinto de "production" Y VERCEL_ENV distinto de "production"
 *  - ALLOW_DEV_UTILITIES=1 explícito en el entorno
 * Sin ambas, devuelve 404 (stealth) para no anunciar la existencia del endpoint.
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
    const credentials: Array<{ email: string; role: string; password: string; created: boolean }> = [];

    for (const u of BOOTSTRAP_USERS) {
      const passwordHash = await hashPassword(u.password);
      const user = await prisma.user.upsert({
        where: { email: u.email },
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          approved: true,
          passwordHash,
        },
        update: {
          name: u.name,
          role: u.role,
          approved: true,
          passwordHash,
        },
        select: { id: true },
      });

      credentials.push({
        email: u.email,
        role: u.role,
        password: u.password,
        created: Boolean(user.id),
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Usuarios de prueba preparados correctamente.",
      credentials,
    });
  } catch (err) {
    console.error("[auth/bootstrap-user]", err);
    return NextResponse.json({ error: "No se pudieron crear usuarios de prueba." }, { status: 500 });
  }
}

