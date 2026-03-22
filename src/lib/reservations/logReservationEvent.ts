/**
 * Registra eventos del ciclo de vida de reservas para analítica.
 */

import { prisma } from "@/lib/db/prisma";

export type ReservationEventType =
  | "RESERVATION_CREATED"
  | "RESERVATION_CREATED_FROM_EMAIL"
  | "RESERVATION_UPDATED"
  | "RESERVATION_CANCELLED"
  | "RESERVATION_RELEASED"
  | "AUTO_RELEASE_TO_COMMON_POOL"
  | "RESERVATION_REJECTED_CONFLICT"
  | "RESERVATION_PATIENT_UPDATED"
  | "RESERVATION_PATIENT_REPLACED"
  | "RESERVATION_PATIENT_CANCELLED";

export type ReservationEventOrigin = "app" | "email" | "gestor";

export interface LogReservationEventParams {
  eventType: ReservationEventType;
  reservationId?: string | null;
  actorUserId?: string | null;
  origin?: ReservationEventOrigin | null;
  detailsJson?: Record<string, unknown> | null;
}

/** Registra un evento de reserva. No lanza errores para no romper el flujo principal. */
export async function logReservationEvent(params: LogReservationEventParams): Promise<void> {
  try {
    await prisma.reservationEvent.create({
      data: {
        reservationId: params.reservationId ?? null,
        eventType: params.eventType,
        actorUserId: params.actorUserId ?? null,
        origin: params.origin ?? null,
        detailsJson: params.detailsJson ? JSON.stringify(params.detailsJson) : null,
      },
    });
  } catch (err) {
    console.error("[logReservationEvent]", err);
  }
}
