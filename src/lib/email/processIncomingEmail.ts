/**
 * Procesamiento de correo entrante: clasificación, parseo, creación de reserva.
 * Usado por el webhook de correo.
 */

import { prisma } from "@/lib/db/prisma";
import { isCirujanoOrEndoscopista } from "@/lib/roleMapping";
import { evaluateBasicBookingPolicy } from "@/lib/reservations/bookingPolicy";
import { classifyIncomingEmail } from "./classifyEmail";
import { parseReservationEmail } from "./parseReservationEmail";
import { createReservationInDb } from "@/lib/reservations/createReservationInDb";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { sendReplyToReservationEmail } from "./outlookService";
import { getReservationReplyContent } from "./reservationReplyTemplates";
import type { InboxMessage, ParsedReservationEmail } from "./types";

const CLASSIFICATION_TO_PRISMA = {
  reservation: "RESERVATION",
  general: "GENERAL",
  access_request: "ACCESS_REQUEST",
  unknown: "UNKNOWN",
} as const;

const STATUS_PROCESSED = "PROCESSED";
const STATUS_FAILED = "FAILED";
const STATUS_SKIPPED = "SKIPPED";

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
    isDeferredUrgency: false,
  }));

  return {
    date: parsed.date,
    resourceId: parsed.resourceId as "Q1" | "Q2" | "Q3" | "procedimientos-menores" | "tecnicas-dolor",
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

async function recordFailure(params: {
  emailMessageId: string;
  classification: string;
  fromEmail: string;
  error: string;
  details?: Record<string, unknown>;
  replyKind?: "format_not_recognized" | "sender_not_registered" | "role_not_authorized" | "slot_occupied";
}): Promise<ProcessEmailResult> {
  if (params.replyKind) {
    const reply = getReservationReplyContent(params.replyKind, { errorDetail: params.error });
    await sendReplyToReservationEmail({ toEmail: params.fromEmail, subject: reply.subject, body: reply.body }).catch(() => {});
  }
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: params.emailMessageId,
      action: "error",
      errorMessage: params.error,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
  await prisma.emailMessage.update({
    where: { id: params.emailMessageId },
    data: { processingStatus: STATUS_FAILED, resultMessage: params.error } as Record<string, unknown>,
  });
  return {
    emailMessageId: params.emailMessageId,
    classification: params.classification,
    processingStatus: STATUS_FAILED,
    error: params.error,
  };
}

export async function processIncomingEmail(message: InboxMessage): Promise<ProcessEmailResult> {
  const externalId = message.id;
  const fromEmail = message.fromEmail?.trim().toLowerCase() ?? "";
  const receivedAt = message.receivedAt ? new Date(message.receivedAt) : new Date();
  const bodyPlain = message.bodyPlain ?? "";

  const existing = await prisma.emailMessage.findUnique({ where: { externalId } });
  if (existing) {
    return {
      emailMessageId: existing.id,
      classification: existing.classification,
      processingStatus: existing.processingStatus,
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
    return { emailMessageId: emailMessage.id, classification, processingStatus: STATUS_SKIPPED };
  }

  const parseResult = parseReservationEmail({ subject: message.subject, bodyPlain });
  if (!parseResult.ok) {
    return recordFailure({
      emailMessageId: emailMessage.id,
      classification,
      fromEmail,
      error: parseResult.error,
      details: { missingFields: parseResult.missingFields },
      replyKind: "format_not_recognized",
    });
  }

  const parsed = parseResult.data;
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "parsed",
      // No registrar rawText ni cuerpo completo en logs auxiliares.
      details: JSON.stringify({
        date: parsed.date,
        resourceId: parsed.resourceId,
        shift: parsed.shift,
        slotIndex: parsed.slotIndex,
        patientCount: parsed.patients?.length ?? 0,
      }),
    },
  });

  const user = await prisma.user.findFirst({
    where: { email: fromEmail, approved: true, deletedAt: null },
  });

  if (!user) {
    return recordFailure({
      emailMessageId: emailMessage.id,
      classification,
      fromEmail,
      error: "Remitente no registrado como usuario activo",
      replyKind: "sender_not_registered",
    });
  }

  if (!isCirujanoOrEndoscopista(user.role)) {
    await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: { senderUserId: user.id } });
    return recordFailure({
      emailMessageId: emailMessage.id,
      classification,
      fromEmail,
      error: "Solo cirujanos y endoscopistas pueden crear reservas por correo",
      details: { userId: user.id, role: user.role },
      replyKind: "role_not_authorized",
    });
  }

  const input = toCreateReservationInput(parsed);
  const policy = evaluateBasicBookingPolicy({
    date: input.date,
    resourceId: input.resourceId,
    responsibleRole: user.role,
    isCoordinator: false,
  });
  if (!policy.ok) {
    await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: { senderUserId: user.id } });
    return recordFailure({
      emailMessageId: emailMessage.id,
      classification,
      fromEmail,
      error: policy.message,
      details: { policyReason: policy.reason },
      replyKind: "format_not_recognized",
    });
  }

  const result = await createReservationInDb(input, user.id, {
    origin: "EMAIL",
    actorUserId: user.id,
  });

  if (!result.ok) {
    if (result.error === "slot_occupied" || result.error === "overflow_conflict") {
      await logReservationEvent({
        eventType: "RESERVATION_REJECTED_CONFLICT",
        actorUserId: user.id,
        origin: "email",
        detailsJson: {
          date: parsed.date,
          resourceId: parsed.resourceId,
          shift: parsed.shift,
          slotIndex: parsed.slotIndex,
          reason: result.error,
        },
      });
    }
    await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: { senderUserId: user.id } });
    return recordFailure({
      emailMessageId: emailMessage.id,
      classification,
      fromEmail,
      error: result.message,
      details: { error: result.error },
      replyKind: result.error === "slot_occupied" || result.error === "overflow_conflict" ? "slot_occupied" : "format_not_recognized",
    });
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

  // Este evento sigue siendo best-effort hasta el bloque específico de hardening de email.
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "reply_sent",
      details: "Respuesta automática solicitada",
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
