/**
 * GET - Listar usuarios (user:list, solo gestores)
 * POST - Crear usuario (user:create). Devuelve contraseña temporal.
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission, hasPermission, hasAnyPermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { roleToFrontend, roleToPrisma } from "@/lib/roleMapping";
import type { User, UserRole } from "@/lib/types";

const VALID_ROLES: UserRole[] = ["cirujano", "anestesista", "gestor", "gestor-anestesista", "endoscopista"];
function generateTempPassword(): string {
  const randomFourDigits = Math.floor(1000 + Math.random() * 9000);
  return `QxFlow${randomFourDigits}`;
}

function emailToDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "Usuario";
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Usuario";
}

export async function POST(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "user:create");
    if (denyPerm) return denyPerm;

    const body = await request.json();
    console.log("[USERS] BODY", body);

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const roleInput = typeof body.role === "string" && VALID_ROLES.includes(body.role as UserRole) ? body.role : "";
    const role = roleToPrisma(roleInput);
    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    const name = rawName || emailToDisplayName(email) || "Usuario";

    console.log("[USERS] creando", { email, role, name: name.slice(0, 20) + (name.length > 20 ? "…" : "") });

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email y rol son obligatorios" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 409 }
      );
    }

    const passwordFromBody = typeof body.password === "string" ? body.password.trim() : "";
    const generatedPassword = !passwordFromBody;
    const tempPassword = generatedPassword ? generateTempPassword() : passwordFromBody;
    const passwordHash = await hashPassword(tempPassword);

    const canSespa = typeof body.canSespa === "boolean" ? body.canSespa : false;

    const dbUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role!,
        approved: true,
        canSespa,
      },
    });

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: roleToFrontend(dbUser.role),
        approved: dbUser.approved,
        canSespa: dbUser.canSespa,
      },
      tempPassword: generatedPassword ? tempPassword : undefined,
    });
  } catch (err) {
    console.error("[USERS] ERROR", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : JSON.stringify(err),
      },
      { status: 500 }
    );
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

    const where = includeInactive ? {} : { approved: true };

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
        }))
      : dbUsers.map((u) => ({
          id: u.id,
          email: "",
          name: u.name,
          role: roleToFrontend(u.role),
          approved: u.approved,
          canSespa: u.canSespa,
          isActive: u.approved,
        }));

    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("[USERS GET]", err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
