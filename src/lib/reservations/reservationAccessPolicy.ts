import type { AuthSession, BookingLike } from "@/lib/auth/authorization";
import { canAccessBooking } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/auth/permissions";

export interface ReservationAccessLike extends BookingLike {
  anesthetistId?: string | null;
}

export type ReservationDetailAccess = "full" | "schedule-only" | "denied";

/**
 * Política única para el detalle de una reserva.
 *
 * - Gestión con booking:view:all: detalle completo.
 * - Cirujano/endoscopista propietario o creador autorizado: detalle completo.
 * - Anestesista asignado: solo datos de agenda, sin pacientes/PII.
 * - Cualquier otro caso: denegado.
 */
export function getReservationDetailAccess(
  session: AuthSession | null,
  reservation: ReservationAccessLike,
): ReservationDetailAccess {
  if (!session?.userId) return "denied";

  if (hasPermission(session.role, "booking:view:all")) return "full";

  if (canAccessBooking(session, reservation, "booking:view:own")) return "full";

  if (
    hasPermission(session.role, "schedule:view:own") &&
    reservation.anesthetistId === session.userId
  ) {
    return "schedule-only";
  }

  return "denied";
}
