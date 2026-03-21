/**
 * Procesamiento de correo entrante: clasificación, parseo, creación de reserva.
 * Usado por el webhook de correo.
 */

import { prisma } from "@/lib/db/prisma";
import { isCirujanoOrEndoscopista } from "@/lib/roleMapping";
import { classifyIncomingEmail } from "./classifyEmail";
import { parseReservationEmail } from "./parseReservationEmail";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { sendReplyToReservationEmail } from "./outlookService";
import { getReservationReplyContent } from "./reservationReplyTemplates";
import type { InboxMessage } from "./types";
import type { ParsedReservationEmail } from "./types";

const CLASSIFICATION_TO_PRISMA = {
  reservation: "RESERVATION",
  general: "GENERAL",
  access_request: "ACCESS_REQUEST",
  unknown: "UNKNOWN",
} as const;

const STATUS_PROCESSED = "PROCESSED";
const STATUS_FAILED = "FAILED";
const STATUS_SKIPPED = "SKIPPED";

/** Convierte ParsedReservationEmail a formato createReservationSchema */
function toCreateReservationInput(parsed: ParsedReservationEmail) {
  const patients = (parsed.patients ?? []).map((p, i) => ({
    historyNumber: p.numeroHistoria,
    fullName: p.name ?? undefined,
    procedure: p.procedure,
    estimatedDurationMinutes: Math.max(1, p.estimatedDurationMinutes || 60),
    anesthesiaType: p.anesthesiaType || "General",
    insuranceType: p.entidadFinanciadora || "SNS",
    admissionType: (p.admissionType === "ingreso" ? "ingreso" : "ambulatorio") as "ingreso" | "ambulatorio",
    orderIndex: i,
    notes: p.notes ?? undefined,
  }));
  const validResources = ["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor"] as const;
  const resourceId = validResources.includes(parsed.resourceId as (typeof validResources)[number])
    ? (parsed.resourceId as (typeof validResources)[number])
    : "Q1";

  return {
    date: parsed.date,
    resourceId,
    shift: parsed.shift,
    slotIndex: parsed.slotIndex,
    patients,
  };
}

export interface ProcessEmailResult {
  emailMessageId: string;
  classification: string;
  processingStatus: string;
  reservationId?: string;
  error?: string;
}

export async function processIncomingEmail(message: InboxMessage): Promise<ProcessEmailResult> {
  const externalId = message.id;
  const fromEmail = message.fromEmail?.trim().toLowerCase() ?? "";
  const receivedAt = message.receivedAt ? new Date(message.receivedAt) : new Date();
  const bodyPlain = message.bodyPlain ?? "";

  // Evitar duplicados
  const existing = await prisma.emailMessage.findUnique({ where: { externalId } });
  if (existing) {
    return {
      emailMessageId: existing.id,
      classification: existing.classification,
      processingStatus: "PROCESSED",
      reservationId: existing.reservationId ?? undefined,
    };
  }

  const classification = classifyIncomingEmail(message);
  const classificationPrisma = CLASSIFICATION_TO_PRISMA[classification];

  const emailMessage = await prisma.emailMessage.create({
    data: {
      externalId,
      fromEmail,
      fromName: message.fromName?.trim() || null,
      subject: message.subject ?? "",
      bodyPlain,
      bodyHtml: message.bodyHtml ?? null,
      receivedAt,
      classification: classificationPrisma,
      processingStatus: "PENDING",
    },
  });

  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "classified",
      details: JSON.stringify({ classification }),
    },
  });

  if (classification !== "reservation") {
    await prisma.emailMessage.update({
      where: { id: emailMessage.id },
      data: { processingStatus: STATUS_SKIPPED },
    });
    return {
      emailMessageId: emailMessage.id,
      classification,
      processingStatus: STATUS_SKIPPED,
    };
  }

  const parseResult = parseReservationEmail({ subject: message.subject, bodyPlain });
  if (!parseResult.ok) {
    const errorMsg = parseResult.error;
    const reply = getReservationReplyContent("format_not_recognized", { errorDetail: errorMsg });
    await sendReplyToReservationEmail({ toEmail: fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});
    await prisma.emailProcessingLog.create({
      data: {
        emailMessageId: emailMessage.id,
        action: "error",
        errorMessage: errorMsg,
        details: JSON.stringify({ missingFields: parseResult.missingFields, rawText: bodyPlain.slice(0, 300) }),
      },
    });
    await prisma.emailMessage.update({
      where: { id: emailMessage.id },
      data: { processingStatus: STATUS_FAILED, resultMessage: errorMsg } as Record<string, unknown>,
    });
    return {
      emailMessageId: emailMessage.id,
      classification,
      processingStatus: STATUS_FAILED,
      error: errorMsg,
    };
  }

  const parsed = parseResult.data;
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "parsed",
      details: JSON.stringify(parsed),
    },
  });

  const user = await prisma.user.findFirst({
    where: { email: fromEmail, approved: true },
  });

  if (!user) {
    const reply = getReservationReplyContent("sender_not_registered");
    await sendReplyToReservationEmail({ toEmail: fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});
    await prisma.emailProcessingLog.create({
      data: {
        emailMessageId: emailMessage.id,
        action: "error",
        errorMessage: "Remitente no registrado como usuario",
        details: JSON.stringify({ fromEmail }),
      },
    });
    await prisma.emailMessage.update({
      where: { id: emailMessage.id },
      data: { processingStatus: STATUS_FAILED, resultMessage: "Remitente no registrado como usuario" } as Record<string, unknown>,
    });
    return {
      emailMessageId: emailMessage.id,
      classification,
      processingStatus: STATUS_FAILED,
      error: "Remitente no registrado como usuario",
    };
  }

  if (!isCirujanoOrEndoscopista(user.role)) {
    const reply = getReservationReplyContent("role_not_authorized");
    await sendReplyToReservationEmail({ toEmail: fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});
    await prisma.emailProcessingLog.create({
      data: {
        emailMessageId: emailMessage.id,
        action: "error",
        errorMessage: "Solo cirujanos y endoscopistas pueden crear reservas por correo",
        details: JSON.stringify({ userId: user.id, role: user.role }),
      },
    });
    await prisma.emailMessage.update({
      where: { id: emailMessage.id },
      data: {
        senderUserId: user.id,
        processingStatus: STATUS_FAILED,
        resultMessage: "Solo cirujanos y endoscopistas pueden crear reservas por correo",
      } as Record<string, unknown>,
    });
    return {
      emailMessageId: emailMessage.id,
      classification,
      processingStatus: STATUS_FAILED,
      error: "Solo cirujanos y endoscopistas pueden crear reservas por correo",
    };
  }

  const input = toCreateReservationInput(parsed);
  const result = await createReservationInDb(input, user.id, {
    origin: "EMAIL",
    actorUserId: user.id,
  });

  if (!result.ok) {
    if (result.error === "slot_occupied") {
      await logReservationEvent({
        eventType: "RESERVATION_REJECTED_CONFLICT",
        actorUserId: user.id,
        origin: "email",
        detailsJson: {
          date: parsed.date,
          resourceId: parsed.resourceId,
          shift: parsed.shift,
          slotIndex: parsed.slotIndex,
        },
      });
    }
    const reply = getReservationReplyContent("slot_occupied", {
      date: parsed.date,
      resourceId: parsed.resourceId,
    });
    await sendReplyToReservationEmail({ toEmail: fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});
    await prisma.emailProcessingLog.create({
      data: {
        emailMessageId: emailMessage.id,
        action: "error",
        errorMessage: result.message,
        details: JSON.stringify({ error: result.error }),
      },
    });
    await prisma.emailMessage.update({
      where: { id: emailMessage.id },
      data: {
        senderUserId: user.id,
        processingStatus: STATUS_FAILED,
        resultMessage: result.message,
      } as Record<string, unknown>,
    });
    return {
      emailMessageId: emailMessage.id,
      classification,
      processingStatus: STATUS_FAILED,
      error: result.message,
    };
  }

  const reply = getReservationReplyContent("reservation_created", {
    reservationId: result.reservationId,
    date: parsed.date,
    resourceId: parsed.resourceId,
  });
  await sendReplyToReservationEmail({ toEmail: fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});

  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "reservation_created",
      details: JSON.stringify({ reservationId: result.reservationId }),
    },
  });

  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "reply_sent",
      details: "Respuesta automática enviada",
    },
  });

  await prisma.emailMessage.update({
    where: { id: emailMessage.id },
    data: {
      senderUserId: user.id,
      reservationId: result.reservationId,
      processingStatus: STATUS_PROCESSED,
      resultMessage: `Reserva creada: ${result.reservationId}`,
    } as Record<string, unknown>,
  });

  return {
    emailMessageId: emailMessage.id,
    classification,
    processingStatus: STATUS_PROCESSED,
    reservationId: result.reservationId,
  };
}
