/**
 * Borrador de respuesta y reserva provisional.
 * AUTO_REPLY sale apagado. Aunque se encienda, este módulo no envía: el envío es el botón Enviar.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { stripSensitiveKeys } from "@/lib/agent/minimize";
import { findFreeOpenings, occupancyFromReservations } from "@/lib/mailbox/availability";
import { buildConfirmationChecklist } from "@/lib/mailbox/confirmationChecklist";
import { createMailboxFromEnv } from "@/lib/mailbox/createMailbox";
import type { FreeOpening } from "@/lib/mailbox/availability";

type ReplyDb = PrismaClient | Prisma.TransactionClient;

export function readAutoReply(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTO_REPLY === "true";
}

export function decideReplyDispatch(input: {
  explicitApproval: boolean;
  autoReply: boolean;
  missing: string[];
  hasClash: boolean;
  checklistReady: boolean;
}): { send: boolean; reason: string } {
  if (input.explicitApproval) return { send: true, reason: "Aprobado con un clic" };
  const simple = input.missing.length === 0 && !input.hasClash && input.checklistReady;
  if (!input.autoReply) return { send: false, reason: "AUTO_REPLY está apagado. Hace falta el clic de un usuario." };
  if (!simple) return { send: false, reason: "AUTO_REPLY no cubre un caso con datos pendientes o conflicto." };
  return { send: true, reason: "AUTO_REPLY en un caso simple, todavía sin enviar desde este módulo." };
}

function clockLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function renderSurgeonReply(input: {
  openings: FreeOpening[];
  missing: string[];
  holdUntil: Date | null;
}): { subject: string; bodyPlain: string } {
  const lines = input.openings.slice(0, 5).map((opening) => {
    const shift = opening.shift === "afternoon" ? "tarde" : "mañana";
    return `- ${opening.resourceId} el ${opening.date} por la ${shift}, desde las ${clockLabel(opening.startMinutes)}`;
  });
  const missing = input.missing.length > 0 ? `\nFalta: ${input.missing.join(", ")}.` : "";
  const hold = input.holdUntil
    ? `\nEl primer hueco queda apartado hasta ${input.holdUntil.toISOString()}. No es una reserva confirmada.`
    : "";
  const body = lines.length > 0
    ? `Huecos posibles:\n${lines.join("\n")}${missing}${hold}\n\nHay que pulsar Enviar para que esta respuesta salga.`
    : `No hay un hueco libre con los datos recibidos.${missing}\n\nHay que pulsar Enviar para que esta respuesta salga.`;
  return { subject: "Huecos propuestos – Bloque Quirúrgico", bodyPlain: body };
}

export function planHold(opening: FreeOpening, now: Date, hours = 48): {
  date: string;
  resourceId: string;
  shift: string;
  startMinutes: number;
  endMinutes: number;
  status: "HOLD";
  expiresAt: Date;
} {
  return {
    date: opening.date,
    resourceId: opening.resourceId,
    shift: opening.shift,
    startMinutes: opening.startMinutes,
    endMinutes: opening.endMinutes,
    status: "HOLD",
    expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
  };
}

export function mailAuditDetail(detail: Record<string, unknown>): string {
  return JSON.stringify(stripSensitiveKeys(detail));
}

/** Quita claves sensibles y guarda el id interno del mensaje, no la dirección. */
export function sealedProposalPayload(payload: Record<string, unknown>, sourceMessageId: string): Record<string, unknown> {
  const safe = stripSensitiveKeys(payload);
  const record = safe && typeof safe === "object" && !Array.isArray(safe) ? { ...(safe as Record<string, unknown>) } : {};
  record.sourceMessageId = sourceMessageId;
  return record;
}

export function readSourceMessageId(payload: Record<string, unknown>): string {
  const value = payload.sourceMessageId;
  return typeof value === "string" ? value.trim() : "";
}

export async function stageSurgeonEmailReply(
  db: ReplyDb,
  input: {
    proposalId: string;
    actorUserId: string;
    toEmail: string;
    surgeonName: string | null;
    openings: FreeOpening[];
    missing: string[];
    explicitApproval: boolean;
    hasClash: boolean;
    checklistReady: boolean;
    now?: Date;
  },
): Promise<{ outboundDraftId: string; sent: false }> {
  const decision = decideReplyDispatch({
    explicitApproval: input.explicitApproval,
    autoReply: readAutoReply(),
    missing: input.missing,
    hasClash: input.hasClash,
    checklistReady: input.checklistReady,
  });
  if (!input.explicitApproval || !decision.send) {
    throw new Error(decision.reason);
  }
  const now = input.now ?? new Date();
  const hold = input.openings[0] ? planHold(input.openings[0], now) : null;
  const reply = renderSurgeonReply({
    openings: input.openings,
    missing: input.missing,
    holdUntil: hold?.expiresAt ?? null,
  });
  const draft = await db.outboundDraft.create({
    data: {
      status: "PENDING_APPROVAL",
      subject: reply.subject,
      bodyText: reply.bodyPlain,
      proposalId: input.proposalId,
      warning: "No se envía solo. Hace falta pulsar Enviar.",
      createdByUserId: input.actorUserId,
      expiresAt: hold?.expiresAt ?? new Date(now.getTime() + 48 * 60 * 60 * 1000),
      recipients: {
        create: [{ email: input.toEmail, displayName: input.surgeonName?.trim() || "Cirujano" }],
      },
    },
    select: { id: true },
  });
  if (hold) {
    await db.provisionalHold.create({
      data: { ...hold, proposalId: input.proposalId },
    });
    await db.mailboxAudit.create({
      data: {
        step: "hold_created",
        actorUserId: input.actorUserId,
        proposalId: input.proposalId,
        detailJson: mailAuditDetail({
          date: hold.date,
          resourceId: hold.resourceId,
          shift: hold.shift,
          startMinutes: hold.startMinutes,
          endMinutes: hold.endMinutes,
          expiresAt: hold.expiresAt.toISOString(),
          sent: false,
        }),
      },
    });
  }
  await db.mailboxAudit.create({
    data: {
      step: "draft_created",
      actorUserId: input.actorUserId,
      proposalId: input.proposalId,
      detailJson: mailAuditDetail({
        openings: input.openings.length,
        explicitApproval: true,
        autoReply: readAutoReply(),
        sent: false,
      }),
    },
  });
  const mailbox = createMailboxFromEnv();
  await mailbox.createReplyDraft({
    to: input.toEmail,
    subject: reply.subject,
    bodyPlain: reply.bodyPlain,
  });
  return { outboundDraftId: draft.id, sent: false };
}

export async function stageApprovedSurgeonProposal(
  db: ReplyDb,
  proposal: { id: string; payloadJson: string; weekStart: string },
  actorUserId: string,
): Promise<{ outboundDraftId: string; sent: false }> {
  const payload = JSON.parse(proposal.payloadJson) as Record<string, unknown>;
  const sourceMessageId = readSourceMessageId(payload);
  const email = sourceMessageId
    ? await db.emailMessage.findUnique({ where: { id: sourceMessageId }, select: { fromEmail: true } })
    : null;
  const toEmail = email?.fromEmail?.trim() ?? "";
  if (!toEmail) throw new Error("La solicitud no tiene un buzón de respuesta");
  const date = typeof payload.date === "string" && payload.date ? payload.date : proposal.weekStart;
  const durationMinutes = typeof payload.durationMinutes === "number" && payload.durationMinutes > 0
    ? payload.durationMinutes
    : 60;
  const shift = payload.shift === "morning" || payload.shift === "afternoon" ? payload.shift : null;
  const missing = Array.isArray(payload.missing) ? payload.missing.filter((item): item is string => typeof item === "string") : [];
  const day = new Date(`${date}T00:00:00.000Z`);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const reservations = await db.reservation.findMany({
    where: { date: { gte: day, lt: next }, status: { in: ["PENDING", "CONFIRMED"] } },
    select: {
      id: true,
      date: true,
      resourceId: true,
      shift: true,
      slotIndex: true,
      surgeonId: true,
      status: true,
      patients: { select: { estimatedDurationMinutes: true, workflowStatus: true, caseLabel: true } },
    },
  });
  const openings = findFreeOpenings({
    dates: [date],
    durationMinutes,
    explicitShift: shift,
    surgeonName: typeof payload.surgeonName === "string" ? payload.surgeonName : null,
    occupied: occupancyFromReservations(reservations.map((reservation) => ({
      id: reservation.id,
      date,
      resourceId: reservation.resourceId,
      shift: reservation.shift === "AFTERNOON" ? "afternoon" : "morning",
      slotIndex: reservation.slotIndex,
      surgeonId: reservation.surgeonId,
      status: reservation.status.toLowerCase(),
      patients: reservation.patients,
    }))),
  });
  const checklist = buildConfirmationChecklist({
    insurance: typeof payload.insurance === "string" ? payload.insurance : null,
    specialMaterial: typeof payload.specialMaterial === "string" ? payload.specialMaterial : null,
  });
  return stageSurgeonEmailReply(db, {
    proposalId: proposal.id,
    actorUserId,
    toEmail,
    surgeonName: typeof payload.surgeonName === "string" ? payload.surgeonName : null,
    openings,
    missing,
    explicitApproval: true,
    hasClash: false,
    checklistReady: checklist.readyToConfirm,
  });
}
