/**
 * Helpers compartidos para la API de reservas.
 */

import { prisma } from "@/lib/db/prisma";

export interface ReservationWithPatients {
  id: string;
  date: Date;
  resourceId: string;
  shift: string;
  slotIndex: number;
  surgeonId: string;
  status: string;
  anesthetistId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  patients: Array<{
    id: string;
    historyNumber: string;
    fullName: string | null;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    insuranceType: string;
    admissionType: string | null;
    orderIndex: number;
    notes: string | null;
    solicitudRecursos: string | null;
  }>;
}

export function toApiReservation(r: ReservationWithPatients) {
  const dateStr = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
  return {
    id: r.id,
    date: dateStr,
    resourceId: r.resourceId,
    shift: r.shift === "MORNING" ? "morning" : "afternoon",
    slotIndex: r.slotIndex,
    surgeonId: r.surgeonId,
    status: r.status.toLowerCase(),
    anesthetistId: r.anesthetistId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    patients: r.patients.map((p) => ({
      id: p.id,
      historyNumber: p.historyNumber,
      fullName: p.fullName ?? undefined,
      procedure: p.procedure,
      estimatedDurationMinutes: p.estimatedDurationMinutes,
      anesthesiaType: p.anesthesiaType,
      insuranceType: p.insuranceType,
      admissionType: p.admissionType ?? undefined,
      orderIndex: p.orderIndex,
      notes: p.notes ?? undefined,
      solicitudRecursos: p.solicitudRecursos ?? undefined,
    })),
  };
}

const RESERVATION_SELECT = {
  id: true,
  date: true,
  resourceId: true,
  shift: true,
  slotIndex: true,
  surgeonId: true,
  status: true,
  anesthetistId: true,
  createdByUserId: true,
  createdAt: true,
  patients: {
    select: {
      id: true,
      historyNumber: true,
      fullName: true,
      procedure: true,
      estimatedDurationMinutes: true,
      anesthesiaType: true,
      insuranceType: true,
      admissionType: true,
      orderIndex: true,
      notes: true,
      solicitudRecursos: true,
    },
  },
} as const;

export async function fetchReservationForAccess(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: RESERVATION_SELECT,
  });
}

export function toBookingLike(r: { id: string; surgeonId: string; createdByUserId?: string | null }) {
  return {
    id: r.id,
    surgeonId: r.surgeonId,
    createdByUserId: r.createdByUserId,
  };
}
