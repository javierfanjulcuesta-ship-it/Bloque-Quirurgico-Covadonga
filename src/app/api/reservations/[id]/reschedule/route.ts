import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission, canAccessBooking } from "@/lib/auth";
import { fetchReservationForAccess, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { readTextBodyWithLimit } from "@/lib/http/requestBody";
import { rescheduleReservation } from "@/lib/reservations/rescheduleReservation";
import { createParteDraft } from "@/lib/drafts/createParteDraft";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;
  const deny = requireAnyPermission(session!, ["booking:update", "booking:view:all"]);
  if (deny) return deny;
  const { id } = await params;
  const reservation = await fetchReservationForAccess(id);
  if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (!canAccessBooking(session!, toBookingLike(reservation), "booking:update")) {
    return NextResponse.json({ error: "No tiene permiso para reprogramar esta reserva" }, { status: 403 });
  }

  const limited = await readTextBodyWithLimit(request, 8 * 1024);
  if (!limited.ok) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(limited.text);
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const raw = body as { date?: unknown; resourceId?: unknown; shift?: unknown; slotIndex?: unknown };
  if (typeof raw.date !== "string" || typeof raw.resourceId !== "string" || (raw.shift !== "morning" && raw.shift !== "afternoon") || typeof raw.slotIndex !== "number") {
    return NextResponse.json({ error: "Indique fecha, quirófano, turno y tramo." }, { status: 400 });
  }
  const result = await rescheduleReservation({
    reservationId: id,
    actorUserId: session!.userId,
    date: raw.date,
    resourceId: raw.resourceId,
    shift: raw.shift,
    slotIndex: raw.slotIndex,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  const draft = await createParteDraft(prisma, { reservationId: id, actorUserId: session!.userId });
  return NextResponse.json({ ok: true, draftId: draft.id });
}
