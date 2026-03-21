/**
 * POST /api/contact - Enviar mensaje de contacto (anon, sin auth).
 * GET /api/contact - Listar mensajes (solo gestor).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hasGestorAccess } from "@/lib/types";

const MAX_BODY_LENGTH = 5000;

export async function POST(request: Request) {
  try {
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
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (!hasGestorAccess(session.role as "gestor" | "gestor-anestesista")) {
      return NextResponse.json({ error: "Solo gestores" }, { status: 403 });
    }

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
