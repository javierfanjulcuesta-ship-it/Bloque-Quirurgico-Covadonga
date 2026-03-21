/**
 * POST /api/email/webhook
 * Webhook para correo entrante. Requiere EMAIL_WEBHOOK_SECRET en header o query.
 *
 * Header: x-email-webhook-secret: <EMAIL_WEBHOOK_SECRET>
 * Query: ?webhookSecret=<EMAIL_WEBHOOK_SECRET>
 *
 * .env: EMAIL_WEBHOOK_SECRET=tu_token_secreto_minimo_16_caracteres
 */

import { NextResponse } from "next/server";
import { validateWebhookSecret } from "@/lib/email/webhookAuth";
import { processIncomingEmail } from "@/lib/email/processIncomingEmail";
import type { InboxMessage } from "@/lib/email/types";

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
        { status: 401 }
      );
    }

    const body = await request.json();
    if (!validatePayload(body)) {
      return NextResponse.json(
        { error: "Payload inválido. Requiere: id, fromEmail, subject, bodyPlain" },
        { status: 400 }
      );
    }

    const message: InboxMessage = {
      id: body.id,
      fromEmail: (body.fromEmail as string).trim().toLowerCase(),
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
  } catch (err) {
    console.error("[email webhook]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar correo" },
      { status: 500 }
    );
  }
}
