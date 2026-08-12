/**
 * POST /api/contact - Enviar mensaje de contacto (anon, sin auth).
 * GET /api/contact - Listar mensajes (solo gestor).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { prisma } from "@/lib/db/prisma";
import { CONTACT_REQUEST_MAX_BYTES, parseContactInput } from "@/lib/contactInput";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";

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

    const rawBody = await readTextBodyWithLimit(request, CONTACT_REQUEST_MAX_BYTES);
    if (!rawBody.ok) {
      return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    }

    const parsed = parseContactInput(rawBody.text);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { fromName, fromEmail, subject, body } = parsed.data;
    await prisma.contactMessage.create({
      data: {
        fromName,
        fromEmail,
        subject: subject || "Mensaje de usuario sin acceso – Bloque Quirúrgico",
        body,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("[contact POST] request failed");
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
  } catch {
    console.error("[contact GET] request failed");
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
