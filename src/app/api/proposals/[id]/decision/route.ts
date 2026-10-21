import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { createParteDraft } from "@/lib/drafts/createParteDraft";
import { rescheduleReservation } from "@/lib/reservations/rescheduleReservation";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requirePermission(session!, "booking:view:all");
  if (deny) return deny;

  const { id } = await params;
  const limited = await readTextBodyWithLimit(request, 16 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const action = (body as { action?: unknown }).action;
  const reason = typeof (body as { reason?: unknown }).reason === "string" ? (body as { reason: string }).reason.slice(0, 500) : null;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  }

  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal || proposal.status !== "PENDING") {
    return NextResponse.json({ error: "La propuesta no está pendiente" }, { status: 409 });
  }
  if (action === "reject") {
    await prisma.proposal.update({
      where: { id },
      data: { status: "REJECTED", decisionReason: reason, decidedByUserId: session!.userId, decidedAt: new Date() },
    });
    return NextResponse.json({ id, status: "REJECTED" });
  }

  const payload = JSON.parse(proposal.payloadJson) as Record<string, unknown>;
  let draftId: string | undefined;
  if (proposal.type === "MOVE_PATIENT" || proposal.type === "ASSIGN_ROOM") {
    const reservationId = typeof payload.reservationId === "string" ? payload.reservationId : "";
    const date = typeof payload.date === "string" ? payload.date : "";
    const resourceId = typeof payload.resourceId === "string" ? payload.resourceId : "";
    const shift = payload.shift === "morning" || payload.shift === "afternoon" ? payload.shift : null;
    const slotIndex = typeof payload.slotIndex === "number" ? payload.slotIndex : null;
    if (!reservationId || !date || !resourceId || !shift || slotIndex == null) {
      return NextResponse.json({ error: "La propuesta no tiene un hueco completo. No se ha movido nada." }, { status: 409 });
    }
    const moved = await rescheduleReservation({
      reservationId,
      actorUserId: session!.userId,
      date,
      resourceId,
      shift,
      slotIndex,
    });
    if (!moved.ok) return NextResponse.json({ error: moved.error, code: moved.code }, { status: moved.status });
    const draft = await createParteDraft(prisma, { reservationId, actorUserId: session!.userId, proposalId: id });
    draftId = draft.id;
  } else if (proposal.type === "DRAFT_PARTE" && typeof payload.reservationId === "string") {
    const draft = await createParteDraft(prisma, {
      reservationId: payload.reservationId,
      actorUserId: session!.userId,
      proposalId: id,
    });
    draftId = draft.id;
  }

  await prisma.proposal.update({
    where: { id },
    data: { status: "APPROVED", decisionReason: reason, decidedByUserId: session!.userId, decidedAt: new Date() },
  });
  return NextResponse.json({ id, status: "APPROVED", draftId: draftId ?? null });
}
