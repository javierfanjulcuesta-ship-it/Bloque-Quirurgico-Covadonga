/**
 * POST /api/auth/logout
 * Cierra la sesión eliminando la cookie.
 */

import { NextResponse } from "next/server";
import { removeSessionCookie } from "@/lib/auth/session";

export async function POST() {
  await removeSessionCookie();
  return NextResponse.json({ ok: true });
}
