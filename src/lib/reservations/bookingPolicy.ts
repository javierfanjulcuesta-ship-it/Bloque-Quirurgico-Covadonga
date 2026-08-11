import { MAX_DAYS_AHEAD } from "@/lib/utils";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENDOSCOPY_RESOURCES = new Set(["procedimientos-menores", "tecnicas-dolor"]);

export type BasicBookingPolicyReason =
  | "invalid_date"
  | "past_date"
  | "weekend"
  | "too_far_ahead"
  | "resource_not_allowed";

export type BasicBookingPolicyResult =
  | { ok: true }
  | { ok: false; reason: BasicBookingPolicyReason; message: string };

export interface BasicBookingPolicyInput {
  date: string;
  resourceId: string;
  /** Rol del profesional responsable de la reserva, no necesariamente el actor gestor. */
  responsibleRole: string;
  /** Gestor puede programar más allá de 28 días, pero no en pasado/fin de semana. */
  isCoordinator: boolean;
  now?: Date;
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/_/g, "-");
}

export function isRealDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Devuelve YYYY-MM-DD según Europe/Madrid, independiente del timezone del servidor. */
export function madridDateOnly(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function evaluateBasicBookingPolicy(input: BasicBookingPolicyInput): BasicBookingPolicyResult {
  if (!isRealDateOnly(input.date)) {
    return { ok: false, reason: "invalid_date", message: "Fecha inválida." };
  }

  const target = new Date(`${input.date}T00:00:00.000Z`);
  const day = target.getUTCDay();
  if (day === 0 || day === 6) {
    return { ok: false, reason: "weekend", message: "No se pueden crear reservas en sábado o domingo." };
  }

  const today = madridDateOnly(input.now);
  if (input.date < today) {
    return { ok: false, reason: "past_date", message: "No se pueden crear reservas en fechas pasadas." };
  }

  if (!input.isCoordinator) {
    const todayUtc = new Date(`${today}T00:00:00.000Z`);
    const daysAhead = Math.round((target.getTime() - todayUtc.getTime()) / 86_400_000);
    if (daysAhead > MAX_DAYS_AHEAD) {
      return {
        ok: false,
        reason: "too_far_ahead",
        message: `Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días por adelantado.`,
      };
    }
  }

  const responsibleRole = normalizeRole(input.responsibleRole);
  if (responsibleRole === "endoscopista" && !ENDOSCOPY_RESOURCES.has(input.resourceId)) {
    return {
      ok: false,
      reason: "resource_not_allowed",
      message: "El perfil endoscopista no puede reservar ese recurso.",
    };
  }

  return { ok: true };
}
