import type { Prisma, PrismaClient } from "@prisma/client";
import { renderParte, type ParteCase, type SuspensionReason } from "./parteTemplate";
import { resolveParteRecipients } from "./recipients";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createParteDraft(
  db: Db,
  params: {
    reservationId: string;
    actorUserId?: string | null;
    proposalId?: string | null;
    suspensionReason?: SuspensionReason | null;
    patientId?: string | null;
  },
): Promise<{ id: string; warning?: string }> {
  const reservation = await db.reservation.findUnique({
    where: { id: params.reservationId },
    include: {
      surgeon: { select: { id: true, name: true, email: true } },
      patients: true,
    },
  });
  if (!reservation) throw new Error("Reserva no encontrada");

  const patients = reservation.patients.filter((patient) => {
    if (params.patientId && patient.id !== params.patientId) return false;
    if (!params.suspensionReason && patient.workflowStatus === "SUSPENDED") return false;
    return true;
  });
  const procedure = patients.map((patient) => patient.procedure).join(" ");
  const [teams, endoscopy, users] = await Promise.all([
    db.mailTeam.findMany({ include: { members: true } }),
    db.serviceRecipient.findUnique({ where: { key: "endoscopias" } }),
    db.user.findMany({
      where: { deletedAt: null, approved: true },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const resolved = resolveParteRecipients({
    surgeonId: reservation.surgeonId,
    surgeonName: reservation.surgeon.name,
    resourceId: reservation.resourceId,
    procedure,
    users,
    teams: teams.map((team) => ({ name: team.name, userIds: team.members.map((member) => member.userId) })),
    endoscopyUserId: endoscopy?.userId,
  });
  const shift = reservation.shift === "AFTERNOON" ? "afternoon" : "morning";
  const date = reservation.date.toISOString().slice(0, 10);
  const cases: ParteCase[] = patients.map((patient) => ({
    date,
    shift,
    slotIndex: reservation.slotIndex,
    fullName: patient.fullName,
    procedure: patient.procedure,
  }));
  const rendered = renderParte(cases, params.suspensionReason);
  const recipients = users.filter((user) => resolved.userIds.includes(user.id) && user.email);
  const draft = await db.outboundDraft.create({
    data: {
      status: "PENDING_APPROVAL",
      subject: rendered.subject,
      bodyText: rendered.body,
      reservationId: reservation.id,
      proposalId: params.proposalId ?? null,
      warning: resolved.warning ?? (recipients.length === 0 ? "No hay destinatarios con buzón." : null),
      createdByUserId: params.actorUserId ?? null,
      recipients: {
        create: recipients.map((user) => ({
          userId: user.id,
          email: user.email,
          displayName: user.name,
        })),
      },
    },
    select: { id: true, warning: true },
  });
  return { id: draft.id, warning: draft.warning ?? undefined };
}
