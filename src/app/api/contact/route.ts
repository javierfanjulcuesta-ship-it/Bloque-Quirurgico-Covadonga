/**
 * POST /api/contact - Enviar mensaje de contacto (anon, sin auth).
 * GET /api/contact - Listar mensajes (solo gestor).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { prisma } from "@/lib/db/prisma";

const MAX_BODY_LENGTH = 5000;
const CONTACT_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 min
const CONTACT_MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(request, "contact", {
      windowMs: CONTACT_RATE_WINDOW_MS,
      maxAttempts: CONTACT_MAX_ATTEMPTS,
    });
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Demasiados envíos. Espere unos minutos e inténtelo de nuevo." },
        {
          status: 429,
          headers: rateLimit.retryAfterSec
            ? { "Retry-After": String(rateLimit.retryAfterSec) }
            : undefined,
        }
      );
    }

    const body = await request.json();
    const fromName = typeof body.fromName === "string" ? body.fromName.trim().slice(0, 200) : "";
    const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim().toLowerCase().slice(0, 200) : "";
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 300) : null;
    const bodyText = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY_LENGTH) : "";

    if (!fromName || !fromEmail) {
      return NextResponse.json(
        { error: "Nombre y correo son obligatorios" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return NextResponse.json(
        { error: "Correo no válido" },
        { status: 400 }
      );
    }
    if (!bodyText) {
      return NextResponse.json(
        { error: "El mensaje no puede estar vacío" },
        { status: 400 }
      );
    }

    await prisma.contactMessage.create({
      data: {
        fromName,
        fromEmail,
        subject: subject || "Mensaje de usuario sin acceso – Bloque Quirúrgico",
        body: bodyText,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact POST]", err);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "contact:view");
    if (denyPerm) return denyPerm;

    const list = await prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      messages: list.map((m) => ({
        id: m.id,
        fromName: m.fromName,
        fromEmail: m.fromEmail,
        subject: m.subject,
        body: m.body,
        date: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[contact GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
