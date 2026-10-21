import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission, canModifyPatientInBooking } from "@/lib/auth";
import { fetchReservationForAccess, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { isSuspensionReason } from "@/lib/drafts/parteTemplate";
import { createParteDraft } from "@/lib/drafts/createParteDraft";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requireAnyPermission(session!, ["patient:cancel", "booking:view:all"]);
  if (deny) return deny;

  const { id } = await params;
  const reservation = await fetchReservationForAccess(id);
  if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (!canModifyPatientInBooking(session!, toBookingLike(reservation), "patient:cancel")) {
    return NextResponse.json({ error: "No tiene permiso para suspender pacientes en esta reserva" }, { status: 403 });
  }

  const limited = await readTextBodyWithLimit(request, 16 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const raw = body as { patientId?: unknown; reason?: unknown; note?: unknown };
  const patientId = typeof raw.patientId === "string" ? raw.patientId : "";
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "";
  if (!patientId || !isSuspensionReason(raw.reason)) {
    return NextResponse.json({ error: "Indique el paciente y un motivo: SIN_SEGURO, CATARRAL, CANCELACION_CIRUJANO u OTRO." }, { status: 400 });
  }

  const patient = reservation.patients.find((item) => item.id === patientId);
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.patientInBlock.update({
      where: { id: patientId },
      data: { workflowStatus: "SUSPENDED", suspensionReason: raw.reason as string, suspensionNote: note || null },
    });
    await tx.scheduleChange.create({
      data: {
        reservationId: id,
        patientId,
        changeType: "SUSPENSION",
        reasonCode: raw.reason as string,
        reasonText: note || null,
        actorUserId: session!.userId,
      },
    });
  });

  const draft = await createParteDraft(prisma, {
    reservationId: id,
    actorUserId: session!.userId,
    patientId,
    suspensionReason: raw.reason,
  });
  return NextResponse.json({ ok: true, draftId: draft.id, status: "SUSPENDED" });
}
