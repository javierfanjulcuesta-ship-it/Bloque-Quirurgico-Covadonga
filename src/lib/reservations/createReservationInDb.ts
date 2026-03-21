/**
 * Lógica compartida para crear reservas en la base de datos.
 * Usada por la API de reservas y por el webhook de correo.
 */

import { prisma } from "@/lib/db/prisma";
import { createReservationSchema } from "@/lib/validations/reservation";
import type { CreateReservationInput } from "@/lib/validations/reservation";
import { logReservationEvent } from "./logReservationEvent";

export type ReservationOrigin = "APP" | "EMAIL" | "GESTOR";

export type CreateReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; error: "slot_occupied" | "invalid_data"; message: string };

export interface CreateReservationOptions {
  origin?: ReservationOrigin;
  actorUserId?: string;
}

export async function createReservationInDb(
  data: CreateReservationInput,
  surgeonId: string,
  options?: CreateReservationOptions
): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: "invalid_data",
      message: first?.message ?? "Datos inválidos",
    };
  }

  const { date, resourceId, shift, slotIndex, patients } = parsed.data;
  const dateObj = new Date(date + "T00:00:00.000Z");
  const shiftEnum = shift === "morning" ? "MORNING" : "AFTERNOON";
  const origin = options?.origin ?? "APP";
  const originPrisma = origin === "EMAIL" ? "EMAIL" : origin === "GESTOR" ? "GESTOR" : "APP";

  const existing = await prisma.reservation.findFirst({
    where: {
      date: dateObj,
      resourceId,
      shift: shiftEnum,
      slotIndex,
      status: { not: "CANCELLED" },
    },
  });

  if (existing) {
    return {
      ok: false,
      error: "slot_occupied",
      message: "El hueco ya está ocupado",
    };
  }

  const actorUserId = options?.actorUserId ?? surgeonId;

  const reservation = await prisma.reservation.create({
    data: {
      date: dateObj,
      resourceId,
      shift: shiftEnum,
      slotIndex,
      surgeonId,
      status: "PENDING",
      origin: originPrisma,
      createdByUserId: actorUserId,
      patients: {
        create: patients.map((p, i) => ({
          historyNumber: p.historyNumber,
          fullName: p.fullName ?? null,
          procedure: p.procedure,
          estimatedDurationMinutes: p.estimatedDurationMinutes,
          anesthesiaType: p.anesthesiaType,
          insuranceType: p.insuranceType,
          admissionType: p.admissionType ?? null,
          orderIndex: p.orderIndex ?? i,
          notes: p.notes ?? null,
          solicitudRecursos: p.solicitudRecursos ?? null,
        })),
      },
    },
  });

  const eventType = origin === "EMAIL" ? "RESERVATION_CREATED_FROM_EMAIL" : "RESERVATION_CREATED";
  await logReservationEvent({
    eventType,
    reservationId: reservation.id,
    actorUserId,
    origin: origin.toLowerCase() as "app" | "email" | "gestor",
    detailsJson: { date, resourceId, shift, slotIndex },
  });

  return { ok: true, reservationId: reservation.id };
}
