/**
 * POST /api/email/webhook
 * Webhook para correo entrante.
 * Requiere EMAIL_WEBHOOK_SECRET mediante el header x-email-webhook-secret.
 * Nunca se aceptan secretos en query string.
 */

import { NextResponse } from "next/server";
import { validateWebhookSecret } from "@/lib/email/webhookAuth";
import { processIncomingEmail } from "@/lib/email/processIncomingEmail";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import type { InboxMessage } from "@/lib/email/types";

// El correo puede contener cuerpo plano + HTML. El límite es deliberadamente
// amplio para no interferir con mensajes normales, pero evita que el webhook
// autenticado reserve memoria sin cota ante payloads anómalos o mal configurados.
const MAX_WEBHOOK_BODY_BYTES = 4 * 1024 * 1024;

const webhookPayloadSchema = {
  id: (v: unknown) => typeof v === "string" && v.length > 0,
  fromEmail: (v: unknown) => typeof v === "string" && v.includes("@"),
  subject: (v: unknown) => typeof v === "string",
  bodyPlain: (v: unknown) => typeof v === "string",
};

function validatePayload(body: unknown): body is InboxMessage {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    webhookPayloadSchema.id(b.id) &&
    webhookPayloadSchema.fromEmail(b.fromEmail) &&
    webhookPayloadSchema.subject(b.subject) &&
    webhookPayloadSchema.bodyPlain(b.bodyPlain)
  );
}

export async function POST(request: Request) {
  try {
    if (!validateWebhookSecret(request)) {
      return NextResponse.json(
        { error: "No autorizado. Incluya x-email-webhook-secret en el header." },
        { status: 401 },
      );
    }

    const bodyResult = await readTextBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyResult.text);
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    if (!validatePayload(body)) {
      return NextResponse.json(
        { error: "Payload inválido. Requiere: id, fromEmail, subject, bodyPlain" },
        { status: 400 },
      );
    }

    const message: InboxMessage = {
      id: body.id,
      fromEmail: body.fromEmail.trim().toLowerCase(),
      fromName: typeof body.fromName === "string" ? body.fromName : undefined,
      subject: body.subject,
      bodyPlain: body.bodyPlain,
      bodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : undefined,
      receivedAt: typeof body.receivedAt === "string" ? body.receivedAt : new Date().toISOString(),
    };

    const result = await processIncomingEmail(message);

    return NextResponse.json({
      ok: result.processingStatus === "PROCESSED",
      emailMessageId: result.emailMessageId,
      classification: result.classification,
      processingStatus: result.processingStatus,
      reservationId: result.reservationId,
      error: result.error,
    });
  } catch {
    console.error("[email webhook] request failed");
    return NextResponse.json({ error: "Error al procesar correo" }, { status: 500 });
  }
}
