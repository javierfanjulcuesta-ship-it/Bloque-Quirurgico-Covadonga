/**
 * GET /api/reservations/[id] - Detalle de una reserva (con control de acceso).
 * PATCH /api/reservations/[id] - Añadir pacientes a reserva existente.
 */

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSessionFromCookie } from "@/lib/auth/session";
import { toAuthSession, requireAuth, requireAnyPermission } from "@/lib/auth";
import { canAccessBooking } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { updateReservationSchema } from "@/lib/validations/reservation";
import { logReservationEvent } from "@/lib/reservations/logReservationEvent";
import { fetchReservationForAccess, toApiReservation, toBookingLike } from "@/lib/reservations/reservationApiHelpers";

export const dynamic = "force-dynamic";

function hasFullReservationView(role: string): boolean {
  const r = role?.trim().toLowerCase().replace(/_/g, "-") ?? "";
  return r === "gestor" || r === "gestor-anestesista" || r === "anestesista";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["booking:view:all", "booking:view:own", "schedule:view:all", "schedule:view:own"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    const canView = hasFullReservationView(session!.role) || canAccessBooking(session, toBookingLike(reservation), "booking:view:own");
    if (!canView) {
      return NextResponse.json({ error: "No tiene permiso para ver esta reserva" }, { status: 403 });
    }

    const apiReservation = toApiReservation(reservation as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation });
  } catch (err) {
    console.error("[reservations GET id]", err);
    return NextResponse.json({ error: "Error al cargar reserva" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = toAuthSession(await getSessionFromCookie());
    const denyAuth = requireAuth(session);
    if (denyAuth) return denyAuth;

    const denyPerm = requireAnyPermission(session!, ["patient:create", "booking:update", "booking:view:all"]);
    if (denyPerm) return denyPerm;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 });

    const reservation = await fetchReservationForAccess(id);
    if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    const canModifyBooking = canAccessBooking(session!, toBookingLike(reservation), "booking:update");
    const canAddPatients = canAccessBooking(session!, toBookingLike(reservation), "booking:view:own");
    if (!canModifyBooking && !canAddPatients) {
      return NextResponse.json({ error: "No tiene permiso para editar esta reserva" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { patients, replacePatients, surgeonId, externalSurgeonName } = parsed.data;
    const wantsOwnerUpdate = surgeonId !== undefined || externalSurgeonName !== undefined;
    const wantsPatientsReplace = replacePatients === true;

    if (wantsOwnerUpdate || wantsPatientsReplace) {
      if (!canModifyBooking) {
        return NextResponse.json({ error: "No tiene permiso para modificar datos del bloque." }, { status: 403 });
      }

      let effectiveSurgeonId = reservation.surgeonId;
      if (surgeonId) {
        const surgeonUser = await prisma.user.findFirst({
          where: {
            id: surgeonId,
            approved: true,
            deletedAt: null,
            role: { in: [UserRole.CIRUJANO, UserRole.ENDOSCOPISTA] },
          },
          select: { id: true },
        });
        if (!surgeonUser) {
          return NextResponse.json(
            { error: "El cirujano responsable no es válido, no está aprobado o no tiene perfil cirujano/endoscopista." },
            { status: 400 }
          );
        }
        effectiveSurgeonId = surgeonUser.id;
      }

      await prisma.$transaction(async (tx) => {
        if (wantsPatientsReplace) {
          await tx.patientInBlock.deleteMany({ where: { reservationId: id } });
          for (let i = 0; i < (patients ?? []).length; i++) {
            const p = (patients ?? [])[i]!;
            await tx.patientInBlock.create({
              data: {
                reservationId: id,
                historyNumber: p.historyNumber,
                fullName: p.fullName ?? null,
                procedure: p.procedure,
                estimatedDurationMinutes: p.estimatedDurationMinutes,
                anesthesiaType: p.anesthesiaType,
                insuranceType: p.insuranceType,
                admissionType: p.admissionType ?? null,
                orderIndex: (p as { orderIndex?: number }).orderIndex ?? i,
                notes: p.notes ?? null,
                solicitudRecursos: p.solicitudRecursos ?? null,
              },
            });
          }
        }
        await tx.reservation.update({
          where: { id },
          data: {
            surgeonId: effectiveSurgeonId,
            externalSurgeonName:
              surgeonId && surgeonId.trim().length > 0
                ? null
                : externalSurgeonName !== undefined
                  ? (externalSurgeonName.trim() || null)
                  : reservation.externalSurgeonName,
            status: (patients?.length ?? 0) > 0 || wantsPatientsReplace ? "CONFIRMED" : reservation.status,
            updatedByUserId: session!.userId,
          },
        });
      });

      await logReservationEvent({
        eventType: "RESERVATION_UPDATED",
        reservationId: id,
        actorUserId: session!.userId,
        origin: "app",
        detailsJson: {
          action: "update_block",
          replacePatients: wantsPatientsReplace,
          ownerUpdated: wantsOwnerUpdate,
          patientsCount: patients?.length ?? null,
        },
      });

      const updated = await fetchReservationForAccess(id);
      if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });
      const apiReservation = toApiReservation(updated as Parameters<typeof toApiReservation>[0]);
      return NextResponse.json({ reservation: apiReservation });
    }

    if (!patients?.length) return NextResponse.json({ error: "Indique al menos un paciente" }, { status: 400 });

    const currentMaxOrder = reservation.patients.reduce((max, p) => Math.max(max, p.orderIndex), -1);
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i]!;
      await prisma.patientInBlock.create({
        data: {
          reservationId: id,
          historyNumber: p.historyNumber,
          fullName: p.fullName ?? null,
          procedure: p.procedure,
          estimatedDurationMinutes: p.estimatedDurationMinutes,
          anesthesiaType: p.anesthesiaType,
          insuranceType: p.insuranceType,
          admissionType: p.admissionType ?? null,
          orderIndex: (p as { orderIndex?: number }).orderIndex ?? (currentMaxOrder + i + 1),
          notes: p.notes ?? null,
          solicitudRecursos: p.solicitudRecursos ?? null,
        },
      });
    }

    await prisma.reservation.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        updatedByUserId: session!.userId,
      },
    });

    await logReservationEvent({
      eventType: "RESERVATION_UPDATED",
      reservationId: id,
      actorUserId: session!.userId,
      origin: "app",
      detailsJson: { action: "add_patients", count: patients.length },
    });

    const updated = await fetchReservationForAccess(id);
    if (!updated) return NextResponse.json({ error: "Reserva actualizada pero no encontrada" }, { status: 500 });

    const apiReservation = toApiReservation(updated as Parameters<typeof toApiReservation>[0]);
    return NextResponse.json({ reservation: apiReservation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar";
    console.error("[reservations PATCH id]", err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
