import { hasIrrecoverableIssues, validateApiReservationShape } from "@/lib/reservations/apiContractBase";

export function isValidApiReservation(value: unknown): boolean {
  return validateApiReservationShape(value).ok;
}

export function assertValidApiReservation(value: unknown, context: string): void {
  const validation = validateApiReservationShape(value);
  if (validation.ok) return;
  console.error("[reservations contract] invalid reservation payload", {
    context,
    reservationId: validation.reservationId,
    reasonCodes: validation.issues.map((i) => i.code),
    issues: validation.issues,
    value,
  });
  throw new Error(`Contrato inválido de reserva en ${context}`);
}

export function assertValidApiReservations(values: unknown[], context: string): void {
  const invalid = values
    .map((v) => ({ value: v, validation: validateApiReservationShape(v) }))
    .filter((x) => !x.validation.ok);
  if (invalid.length === 0) return;
  console.error("[reservations contract] invalid reservations payload", {
    context,
    invalidCount: invalid.length,
    sample: invalid.slice(0, 3).map((x) => ({
      reservationId: x.validation.reservationId,
      reasonCodes: x.validation.issues.map((i) => i.code),
      issues: x.validation.issues,
      value: x.value,
    })),
  });
  throw new Error(`Contrato inválido de reservas en ${context}`);
}

export interface ApiReservationsValidationSummary {
  invalidCount: number;
  fatalCount: number;
  warningCount: number;
  infoCount: number;
  hasIrrecoverable: boolean;
  samples: Array<{
    reservationId?: string;
    reasonCodes: string[];
    severities: string[];
  }>;
}

export function summarizeApiReservationsValidation(values: unknown[]): ApiReservationsValidationSummary {
  const invalid = values
    .map((v) => ({ value: v, validation: validateApiReservationShape(v) }))
    .filter((x) => !x.validation.ok);
  const fatalCount = invalid.reduce((acc, x) => acc + x.validation.issues.filter((i) => i.severity === "fatal").length, 0);
  const warningCount = invalid.reduce((acc, x) => acc + x.validation.issues.filter((i) => i.severity === "warning").length, 0);
  const infoCount = invalid.reduce((acc, x) => acc + x.validation.issues.filter((i) => i.severity === "info").length, 0);
  return {
    invalidCount: invalid.length,
    fatalCount,
    warningCount,
    infoCount,
    hasIrrecoverable: invalid.some((x) => hasIrrecoverableIssues(x.validation)),
    samples: invalid.slice(0, 5).map((x) => ({
      reservationId: x.validation.reservationId,
      reasonCodes: x.validation.issues.map((i) => i.code),
      severities: x.validation.issues.map((i) => i.severity),
    })),
  };
}

export function logApiReservationsValidationBySeverity(values: unknown[], context: string): ApiReservationsValidationSummary {
  const summary = summarizeApiReservationsValidation(values);
  if (summary.invalidCount === 0) return summary;

  if (summary.fatalCount > 0) {
    console.error("[reservations contract] fatal validation issues", {
      context,
      ...summary,
    });
  }
  if (summary.warningCount > 0 || summary.infoCount > 0) {
    console.warn("[reservations contract] non-fatal validation issues", {
      context,
      invalidCount: summary.invalidCount,
      warningCount: summary.warningCount,
      infoCount: summary.infoCount,
      samples: summary.samples,
    });
  }
  return summary;
}
