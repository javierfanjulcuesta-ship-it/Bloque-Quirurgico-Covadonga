/**
 * POST /api/auth/register
 * Registro administrativo legacy. SOLO el gestor puede crear usuarios.
 *
 * Mantiene compatibilidad con clientes que aún envían una contraseña explícita,
 * pero usa el mismo servicio transaccional/auditado que /api/users para que no
 * exista una segunda vía de alta con semántica distinta.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { validatePasswordStrength } from "@/lib/auth/passwordValidation";
import { roleToFrontend, roleToPrisma } from "@/lib/roleMapping";
import type { UserRole } from "@/lib/types";
import { createUserWithAudit } from "@/lib/users/userCreationService";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];
const SESPA_ROLES = new Set<UserRole>(["anestesista", "gestor-anestesista"]);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;

    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 200) : "";
    const roleInput =
      typeof input.role === "string" && VALID_ROLES.includes(input.role as UserRole)
        ? (input.role as UserRole)
        : null;
    const role = roleInput ? roleToPrisma(roleInput) : null;

    if (!isValidEmail(email) || !password || !name || !role || !roleInput) {
      return NextResponse.json(
        { error: "Email válido, contraseña, nombre y rol son obligatorios" },
        { status: 400 }
      );
    }

    const pwdValidation = validatePasswordStrength(password);
    if (!pwdValidation.valid) {
      return NextResponse.json(
        { error: pwdValidation.error },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const canSespa = SESPA_ROLES.has(roleInput) && input.canSespa === true;
    const result = await createUserWithAudit(prisma, {
      email,
      passwordHash,
      name,
      role,
      canSespa,
      actorUserId: session!.userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 }
      );
    }

    const dbUser = result.user;
    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleToFrontend(dbUser.role),
        approved: dbUser.approved,
        canSespa: dbUser.canSespa,
      },
    });
  } catch (err) {
    console.error("[auth/register]", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
