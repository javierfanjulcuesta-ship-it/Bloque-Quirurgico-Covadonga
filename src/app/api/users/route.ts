/**
 * GET - Listar usuarios (user:list, solo gestores)
 * POST - Crear usuario (user:create). Devuelve contraseña temporal.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, hasPermission, hasAnyPermission } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporaryPassword";
import { roleToFrontend, roleToPrisma } from "@/lib/roleMapping";
import type { UserRole } from "@/lib/types";
import { createUserWithAudit } from "@/lib/users/userCreationService";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista", "gestion-citas"];
const SESPA_ROLES = new Set<UserRole>(["anestesista", "gestor-anestesista"]);
const USER_CREATE_BODY_MAX_BYTES = 16 * 1024;

function emailToDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "Usuario";
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Usuario";
}

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

    const limitedBody = await readTextBodyWithLimit(request, USER_CREATE_BODY_MAX_BYTES);
    if (!limitedBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(limitedBody.text);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;

    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const roleInput = typeof input.role === "string" && VALID_ROLES.includes(input.role as UserRole) ? input.role as UserRole : null;
    const role = roleInput ? roleToPrisma(roleInput) : null;
    const rawName = typeof input.name === "string" ? input.name.trim() : "";
    const name = (rawName || emailToDisplayName(email) || "Usuario").slice(0, 200);

    if (!isValidEmail(email) || !role || !roleInput) {
      return NextResponse.json({ error: "Email válido y rol son obligatorios" }, { status: 400 });
    }

    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
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
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
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
      tempPassword,
    });
  } catch {
    console.error("[USERS POST] Error creating user");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Lista usuarios. user:list → datos completos (gestores), puede incluir inactivos si ?includeInactive=1.
 * Sin user:list pero con booking:create o schedule:view:own → lista mínima (solo activos) para co-surgeon, display.
 */
export async function GET(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const hasFullList = hasPermission(session!.role, "user:list");
    const hasMinimal = hasAnyPermission(session!.role, [
      "booking:create",
      "booking:view:own",
      "schedule:view:own",
    ]);

    if (!hasFullList && !hasMinimal) {
      return NextResponse.json({ error: "No tiene permisos para listar usuarios" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = hasFullList && searchParams.get("includeInactive") === "1";
    const includeDeleted = hasFullList && searchParams.get("includeDeleted") === "1";

    const where: Prisma.UserWhereInput = {};
    if (!includeDeleted) where.deletedAt = null;
    if (!includeInactive) where.approved = true;

    const dbUsers = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        approved: true,
        canSespa: true,
        deletedAt: true,
      },
    });

    const users = hasFullList
      ? dbUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: roleToFrontend(u.role),
          approved: u.approved,
          canSespa: u.canSespa,
          isActive: u.approved,
          deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
        }))
      : dbUsers.map((u) => ({
          id: u.id,
          email: "",
          name: u.name,
          role: roleToFrontend(u.role),
          approved: u.approved,
          canSespa: undefined,
          isActive: u.approved,
          deletedAt: null,
        }));

    return NextResponse.json({ users });
  } catch {
    console.error("[USERS GET] Error listing users");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
