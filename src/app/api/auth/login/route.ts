/**
 * POST /api/auth/login
 * Autenticación real: email + contraseña.
 * Rate limit: 5 intentos / 15 min por combinación IP + cuenta.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, addSessionCookieToResponse } from "@/lib/auth/session";
import { checkLoginRateLimit, resetLoginRateLimitOnSuccess } from "@/lib/auth/rateLimit";
import { roleToFrontend } from "@/lib/roleMapping";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import type { User } from "@/lib/types";

const LOGIN_REQUEST_MAX_BYTES = 8_192;

export async function POST(request: Request) {
  try {
    const rawBody = await readTextBodyWithLimit(request, LOGIN_REQUEST_MAX_BYTES);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.text);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";

    const rateLimit = checkLoginRateLimit(request, email);
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos de acceso para esta cuenta. Espere unos minutos e inténtelo de nuevo." },
        {
          status: 429,
          headers: rateLimit.retryAfterSec
            ? { "Retry-After": String(rateLimit.retryAfterSec) }
            : undefined,
        }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        approved: true,
        deletedAt: true,
        passwordHash: true,
      },
    });

    if (!dbUser || !dbUser.approved || dbUser.deletedAt != null) {
      return NextResponse.json(
        { error: "Credenciales inválidas o usuario no aprobado" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const role = roleToFrontend(dbUser.role);
    const user: User = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role,
      approved: dbUser.approved,
    };

    const token = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      approved: user.approved,
    });

    resetLoginRateLimitOnSuccess(request, email);
    const res = NextResponse.json({ user });
    return addSessionCookieToResponse(res, token);
  } catch {
    console.error("Login error");
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
