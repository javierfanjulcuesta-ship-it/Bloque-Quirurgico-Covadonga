import { getSlots } from "@/lib/utils";

export const PARTE_PHONE = "603 618 877";
export const PARTE_MAILBOX = "quirofano.covadonga@riberacare.com";
export const PARTE_SIGNATURE_LINES = [
  "Gestor QxFlow · Bloque quirúrgico · Hospital Covadonga",
  PARTE_PHONE,
  PARTE_MAILBOX,
] as const;

export const SUSPENSION_REASONS = ["SIN_SEGURO", "CATARRAL", "CANCELACION_CIRUJANO", "OTRO"] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export function isSuspensionReason(value: unknown): value is SuspensionReason {
  return typeof value === "string" && (SUSPENSION_REASONS as readonly string[]).includes(value);
}

/** Iniciales calculadas en servidor. Nunca devuelve el nombre completo. */
export function patientInitials(fullName: string | null | undefined): string {
  const parts = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0 && !/^[-–—]+$/.test(part));
  if (parts.length === 0) return "—";
  return parts.map((part) => `${part[0]!.toLocaleUpperCase("es-ES")}.`).join("");
}

export interface ParteCase {
  date: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
  /** Solo cuando el nombre llega del Excel de esta sesión. No se lee de la base. */
  fullName?: string | null;
  caseLabel?: string | null;
  procedure: string;
}

function weekdayAndDate(isoDate: string): { weekday: string; dayMonth: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(isoDate)) return null;
  const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" }).format(date);
  const dayMonth = `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
  return { weekday, dayMonth };
}

export function slotClock(shift: "morning" | "afternoon", slotIndex: number): string | null {
  const slot = getSlots(shift)[slotIndex];
  return slot?.start ?? null;
}

export function formatParteLine(item: ParteCase): string | null {
  const when = weekdayAndDate(item.date);
  const clock = slotClock(item.shift, item.slotIndex);
  if (!when || !clock) return null;
  const turno = item.shift === "morning" ? "MAÑANA" : "TARDE";
  const procedure = item.procedure.trim() || "Procedimiento";
  const who = item.fullName?.trim()
    ? patientInitials(item.fullName)
    : (item.caseLabel?.trim() || "Caso");
  return `${when.weekday} ${when.dayMonth} · ${clock} · ${turno} · ${who} — ${procedure}`;
}

export function renderParte(cases: ParteCase[], suspensionReason?: SuspensionReason | null): { subject: string; body: string } {
  const lines = cases.map(formatParteLine).filter((line): line is string => Boolean(line));
  const reasonLine = suspensionReason ? `Motivo: ${suspensionReason}` : null;
  const body = [...(reasonLine ? [reasonLine] : []), ...lines, "", ...PARTE_SIGNATURE_LINES].join("\n");
  return {
    subject: suspensionReason ? "Suspensión de parte quirúrgico" : "Parte quirúrgico",
    body,
  };
}
