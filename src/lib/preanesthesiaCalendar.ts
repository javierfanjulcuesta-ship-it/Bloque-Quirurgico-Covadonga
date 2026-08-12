import type { Reservation } from "@/lib/types";

const MADRID_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Convierte un instante ISO/Date a YYYY-MM-DD en Europe/Madrid.
 * Las citas se guardan como instantes UTC; el calendario clínico debe agruparlas
 * por el día local en que el paciente acudirá a consulta.
 */
export function madridDateOnlyFromInstant(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = MADRID_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * Cuenta citas de preanestesia realmente persistidas por fecha local de Madrid.
 *
 * No infiere carga de consulta a partir de la fecha de cirugía: usa exclusivamente
 * preanesthesiaAppointmentAt, que es la fuente de verdad de la autocita.
 */
export function countPreanesthesiaAppointmentsByDate(
  reservations: Pick<Reservation, "patients">[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const reservation of reservations) {
    for (const patient of reservation.patients ?? []) {
      if (!patient.preanesthesiaAppointmentAt) continue;
      // Si existe estado explícito y ya no está programado, no debe ocupar capacidad.
      if (patient.preanesthesiaStatus && patient.preanesthesiaStatus !== "SCHEDULED") continue;

      const date = madridDateOnlyFromInstant(patient.preanesthesiaAppointmentAt);
      if (!date) continue;
      counts[date] = (counts[date] ?? 0) + 1;
    }
  }

  return counts;
}

/** Limita el mapa a un intervalo YYYY-MM-DD inclusivo para la semana visible. */
export function filterPreanesthesiaCountsByDateRange(
  counts: Record<string, number>,
  from: string,
  to: string,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).filter(([date]) => date >= from && date <= to),
  );
}
