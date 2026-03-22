/**
 * Sesiones JWT para autenticación real.
 * Cookie httpOnly con token firmado.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const COOKIE_NAME = "bloque_session";
const MAX_AGE = 60 * 60 * 24 * 3; // 3 días (piloto: sesiones más cortas)

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  exp: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${MAX_AGE}s`)
    .setIssuedAt()
    .sign(getSecret());
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function getCookieOptions(maxAge = MAX_AGE) {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

/** Adjunta la cookie de sesión a una NextResponse (recomendado en route handlers). */
export function addSessionCookieToResponse(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, getCookieOptions());
  return response;
}

/** @deprecated Usar addSessionCookieToResponse para garantizar que la cookie se envíe. */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, getCookieOptions());
}

export async function getSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function removeSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { ...getCookieOptions(0), maxAge: 0 });
}
