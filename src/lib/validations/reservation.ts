/**
 * Validación de reservas con zod.
 * Compatible con DateTime (date como YYYY-MM-DD), enums para shift.
 */

import { z } from "zod";

const RESOURCE_IDS = ["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor"] as const;
const SHIFTS = ["morning", "afternoon"] as const;
const ADMISSION_TYPES = ["ingreso", "ambulatorio"] as const;

/** Fecha YYYY-MM-DD válida, compatible con DateTime de Prisma */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").refine(
  (d) => {
    const date = new Date(d + "T00:00:00.000Z");
    return !isNaN(date.getTime()) && date.toISOString().startsWith(d);
  },
  { message: "Fecha no válida" }
);

const patientSchema = z.object({
  historyNumber: z.string().min(1, "Nº historia obligatorio"),
  fullName: z.string().optional(),
  procedure: z.string().min(1, "Procedimiento obligatorio"),
  estimatedDurationMinutes: z.number().int().positive("Duración debe ser > 0"),
  anesthesiaType: z.string().min(1, "Tipo de anestesia obligatorio"),
  insuranceType: z.string().min(1, "Entidad financiadora obligatoria"),
  admissionType: z.enum(ADMISSION_TYPES).optional(),
  orderIndex: z.number().int().min(0),
  notes: z.string().optional(),
  solicitudRecursos: z.string().optional(),
});

export const createReservationSchema = z.object({
  date: dateSchema,
  resourceId: z.enum(RESOURCE_IDS, { errorMap: () => ({ message: "resourceId inválido" }) }),
  shift: z.enum(SHIFTS, { errorMap: () => ({ message: "shift inválido (morning|afternoon)" }) }),
  slotIndex: z.number().int().min(0, "slotIndex debe ser >= 0"),
  patients: z.array(patientSchema).optional().default([]),
}).refine(
  (data) => {
    if (data.shift === "morning" && data.slotIndex > 5) return false;
    if (data.shift === "afternoon" && data.slotIndex > 4) return false;
    return true;
  },
  { message: "slotIndex fuera de rango (mañana: 0-5, tarde: 0-4)", path: ["slotIndex"] }
);

export const getReservationsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  resourceId: z.enum(RESOURCE_IDS).optional(),
  surgeonId: z.string().optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type GetReservationsQuery = z.infer<typeof getReservationsQuerySchema>;
