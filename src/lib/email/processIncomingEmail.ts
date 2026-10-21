/**
 * Procesamiento de correo entrante: clasificación, parseo, creación de reserva.
 * Usado por el webhook de correo.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isCirujanoOrEndoscopista } from "@/lib/roleMapping";
import { evaluateBasicBookingPolicy } from "@/lib/reservations/bookingPolicy";
import { classifyIncomingEmail } from "./classifyEmail";
import { parseReservationEmail } from "./parseReservationEmail";
import { decideIncomingResource, missingFieldsLeaveRoomPending } from "@/lib/program/recognizeResource";
import { missingFieldsLeaveShiftPending, suggestSurgeonHabit, TURNO_INFERIDO } from "@/lib/surgeons/habits";
import { stripSensitiveKeys } from "@/lib/agent/minimize";
import { caseLabelFromOrder } from "@/lib/patients/caseLabel";
import { planIncomingEmailStorage, redactLogDetails, redactOperationalError, sanitizeEventDetails } from "@/lib/identity/patientIdentity";
import { persistIdentityVault } from "@/lib/identity/persistIdentityVault";
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
    caseLabel: caseLabelFromOrder(i),
    procedure: p.procedure,
    estimatedDurationMinutes: Math.max(1, p.estimatedDurationMinutes || 60),
    anesthesiaType: p.anesthesiaType || "General",
    insuranceType: p.entidadFinanciadora || "SNS",
    admissionType: (p.admissionType === "ingreso" ? "ingreso" : "ambulatorio") as "ingreso" | "ambulatorio",
    orderIndex: i,
    notes: p.notes ?? undefined,
    isDeferredUrgency: false,
  }));

  const resource = decideIncomingResource(parsed.resourceId);
  if (resource.action !== "use") return null;
  return {
    date: parsed.date,
    resourceId: resource.resourceId,
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

function resultFromExisting(existing: {
  id: string;
  classification: string;
  processingStatus: string;
  reservationId: string | null;
  resultMessage: string | null;
}): ProcessEmailResult {
  return {
    emailMessageId: existing.id,
    classification: existing.classification,
    processingStatus: existing.processingStatus,
    reservationId: existing.reservationId ?? undefined,
    error: existing.processingStatus === STATUS_FAILED ? existing.resultMessage ?? undefined : undefined,
  };
}

function storedLogDetails(details?: Record<string, unknown> | null): string | null {
  if (!details) return null;
  return redactLogDetails(JSON.stringify(sanitizeEventDetails(details)));
}

async function claimIncomingEmail(params: {
  externalId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyPlain: string;
  bodyHtml: string | null;
  receivedAt: Date;
  classification: (typeof CLASSIFICATION_TO_PRISMA)[keyof typeof CLASSIFICATION_TO_PRISMA];
}) {
  const plan = planIncomingEmailStorage({
    fromName: params.fromName,
    subject: params.subject,
    bodyPlain: params.bodyPlain,
    bodyHtml: params.bodyHtml,
  });
  try {
    const emailMessage = await prisma.emailMessage.create({
      data: {
        externalId: params.externalId,
        fromEmail: params.fromEmail,
        fromName: plan.row.fromName,
        subject: plan.row.subject,
        bodyPlain: plan.row.bodyPlain,
        bodyHtml: plan.row.bodyHtml,
        bodySummary: plan.row.bodySummary,
        identityMode: plan.row.identityMode,
        bodyRedactedAt: plan.row.bodyRedactedAt,
        receivedAt: params.receivedAt,
        classification: params.classification,
        processingStatus: "PENDING",
      },
    });
    await persistIdentityVault(prisma, {
      subjectKind: "email",
      subjectId: emailMessage.id,
      role: "system",
      vault: plan.vault,
    });
    return { created: true as const, emailMessage };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    const existing = await prisma.emailMessage.findUnique({ where: { externalId: params.externalId } });
    if (!existing) throw err;
    return { created: false as const, emailMessage: existing };
  }
}

async function recordFailure(params: {
  emailMessageId: string;
  classification: string;
  fromEmail: string;
  error: string;
  details?: Record<string, unknown>;
  replyKind?: "format_not_recognized" | "sender_not_registered" | "role_not_authorized" | "slot_occupied";
}): Promise<ProcessEmailResult> {
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: params.emailMessageId,
      action: "error",
      errorMessage: redactOperationalError(params.error),
      details: storedLogDetails(params.details),
    },
  });
  await prisma.emailMessage.update({
    where: { id: params.emailMessageId },
    data: { processingStatus: STATUS_FAILED, resultMessage: redactOperationalError(params.error) } as Record<string, unknown>,
  });
  return {
    emailMessageId: params.emailMessageId,
    classification: params.classification,
    processingStatus: STATUS_FAILED,
    error: params.error,
  };
}

/** Sala no reconocida: no crea reserva, no contesta como confirmada y no inventa Q1. */
async function leaveRoomPending(params: {
  emailMessageId: string;
  classification: string;
  error: string;
}): Promise<ProcessEmailResult> {
  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: params.emailMessageId,
      action: "room_pending",
      errorMessage: redactOperationalError(params.error),
      details: storedLogDetails({ resourceId: null, fallback: null }),
    },
  });
  await prisma.emailMessage.update({
    where: { id: params.emailMessageId },
    data: { processingStatus: "PENDING", resultMessage: params.error },
  });
  return {
    emailMessageId: params.emailMessageId,
    classification: params.classification,
    processingStatus: "PENDING",
    error: params.error,
  };
}

export async function processIncomingEmail(message: InboxMessage): Promise<ProcessEmailResult> {
  const externalId = message.id;
  const fromEmail = message.fromEmail?.trim().toLowerCase() ?? "";
  const receivedAt = message.receivedAt ? new Date(message.receivedAt) : new Date();
  const bodyPlain = message.bodyPlain ?? "";

  const existing = await prisma.emailMessage.findUnique({ where: { externalId } });
  if (existing) return resultFromExisting(existing);

  const classification = classifyIncomingEmail(message);
  const classificationPrisma = CLASSIFICATION_TO_PRISMA[classification];
  const claimed = await claimIncomingEmail({
    externalId,
    fromEmail,
    fromName: message.fromName?.trim() || null,
    subject: message.subject ?? "",
    bodyPlain,
    bodyHtml: message.bodyHtml ?? null,
    receivedAt,
    classification: classificationPrisma,
  });
  if (!claimed.created) return resultFromExisting(claimed.emailMessage);
  const emailMessage = claimed.emailMessage;

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
    if (missingFieldsLeaveRoomPending(parseResult.missingFields)) {
      return leaveRoomPending({
        emailMessageId: emailMessage.id,
        classification,
        error: "Sala no reconocida. La solicitud queda pendiente y no se asigna Q1.",
      });
    }
    if (missingFieldsLeaveShiftPending(parseResult.missingFields)) {
      const sender = await prisma.user.findFirst({
        where: { email: fromEmail, approved: true, deletedAt: null },
        select: { name: true, surgeonDefault: { select: { defaultShift: true, preferredResourceId: true, active: true } } },
      });
      const saved = sender?.surgeonDefault
        ? {
            defaultShift: sender.surgeonDefault.defaultShift === "MORNING"
              ? "morning" as const
              : sender.surgeonDefault.defaultShift === "AFTERNOON"
                ? "afternoon" as const
                : null,
            preferredResourceId: sender.surgeonDefault.preferredResourceId,
            active: sender.surgeonDefault.active,
          }
        : null;
      const suggestion = suggestSurgeonHabit({
        explicitShift: null,
        surgeonName: sender?.name || message.fromName || "",
        saved,
      });
      if (suggestion.flags.includes(TURNO_INFERIDO)) {
        return leaveRoomPending({
          emailMessageId: emailMessage.id,
          classification,
          error: `Turno sugerido ${suggestion.shift === "afternoon" ? "tarde" : "mañana"} marcado ${TURNO_INFERIDO}. No se ha grabado la reserva.`,
        });
      }
    }
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
  if (!input) {
    return leaveRoomPending({
      emailMessageId: emailMessage.id,
      classification,
      error: "Sala no reconocida. La solicitud queda pendiente y no se asigna Q1.",
    });
  }
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

  const proposal = await prisma.proposal.create({
    data: {
      weekStart: input.date,
      type: "INTAKE_EMAIL",
      status: "PENDING",
      summary: `Propuesta de correo ${input.date}`.slice(0, 240),
      payloadJson: JSON.stringify(stripSensitiveKeys({
        date: input.date,
        resourceId: input.resourceId,
        shift: input.shift,
        slotIndex: input.slotIndex,
        surgeonUserId: user.id,
        policyOk: policy.ok,
        patients: (parsed.patients ?? []).map((patient, index) => ({
          caseLabel: caseLabelFromOrder(index),
          procedure: patient.procedure,
          minutes: patient.estimatedDurationMinutes,
        })),
      })),
    },
    select: { id: true },
  });

  await prisma.emailProcessingLog.create({
    data: {
      emailMessageId: emailMessage.id,
      action: "proposal_pending",
      details: JSON.stringify({ proposalId: proposal.id }),
    },
  });
  await prisma.emailMessage.update({
    where: { id: emailMessage.id },
    data: {
      senderUserId: user.id,
      processingStatus: "PENDING",
      resultMessage: `Propuesta pendiente de aprobación humana: ${proposal.id}`,
    },
  });
  return {
    emailMessageId: emailMessage.id,
    classification,
    processingStatus: "PENDING",
  };
}
