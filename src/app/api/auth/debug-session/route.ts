/**
 * GET /api/auth/debug-session
 * TEMPORAL: diagnóstico de sesión/cookie sin mirar logs.
 * Eliminar cuando el problema de sesión esté resuelto.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { COOKIE_NAME, getSessionFromCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET no configurado");
  }
  return new TextEncoder().encode(secret);
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    const token = cookie?.value ?? null;
    const cookiePresent = !!cookie;
    const tokenPresent = !!token;

    let status: "cookie_missing" | "token_invalid" | "token_expired" | "session_ok" = "cookie_missing";
    let sessionValid = false;
    let verifyError: string | null = null;

    if (tokenPresent && token) {
      const session = await getSessionFromCookie();
      if (session) {
        status = "session_ok";
        sessionValid = true;
      } else {
        try {
          await jwtVerify(token, getSecret());
          status = "token_invalid";
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/expired|exp/i.test(msg)) {
            status = "token_expired";
          } else {
            status = "token_invalid";
          }
          verifyError = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
        }
      }
    }

    const body = {
      cookiePresent,
      tokenPresent,
      cookieName: COOKIE_NAME,
      status,
      sessionValid,
      tokenLength: token ? token.length : 0,
      verifyError: verifyError ? verifyError.replace(/[a-zA-Z0-9+/=]{20,}/g, "...") : null,
    };

    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Error en diagnóstico",
        detail: msg.slice(0, 100),
      },
      { status: 500 }
    );
  }
}
