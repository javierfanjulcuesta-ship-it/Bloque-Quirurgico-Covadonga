/**
 * POST /api/reservations/move-patients
 * Mueve pacientes entre reservas del mismo día (transacción atómica en servidor).
 */

import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requirePermission } from "@/lib/auth";
import { canAccessBooking } from "@/lib/auth";
import { movePatientsBetweenReservationsSchema } from "@/lib/validations/reservation";
import { fetchReservationForAccess, toBookingLike } from "@/lib/reservations/reservationApiHelpers";
import { movePatientsBetweenReservationsInDb } from "@/lib/reservations/movePatientsBetweenReservationsInDb";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requirePermission(session!, "booking:update");
    if (denyPerm) return denyPerm;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = movePatientsBetweenReservationsSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { sourceReservationId, targetReservationId, patientIds } = parsed.data;

    const source = await fetchReservationForAccess(sourceReservationId);
    const target = await fetchReservationForAccess(targetReservationId);
    if (!source || !target) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (!canAccessBooking(session!, toBookingLike(source), "booking:update")) {
      return NextResponse.json({ error: "No tiene permiso para modificar la reserva origen" }, { status: 403 });
    }
    if (!canAccessBooking(session!, toBookingLike(target), "booking:update")) {
      return NextResponse.json({ error: "No tiene permiso para modificar la reserva destino" }, { status: 403 });
    }

    const result = await movePatientsBetweenReservationsInDb({
      actorUserId: session!.userId,
      sourceReservationId,
      targetReservationId,
      patientIds,
    });

    if (!result.ok) {
      const status = result.code === "capacity" ? 409 : result.code === "conflict" ? 409 : 400;
      return NextResponse.json({ error: result.message, code: result.code }, { status });
    }

    return NextResponse.json({
      ok: true,
      destinationHeadReservationId: result.destinationHeadReservationId,
      expansionSlotsCreated: result.expansionSlotsCreated,
    });
  } catch (err) {
    console.error("[reservations move-patients]", err);
    return NextResponse.json({ error: "Error al mover pacientes" }, { status: 500 });
  }
}
