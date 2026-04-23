export type ApiReservationReasonCode =
  | "not_object"
  | "missing_id"
  | "missing_date"
  | "missing_resource_id"
  | "invalid_shift"
  | "invalid_slot_index"
  | "missing_surgeon_id"
  | "invalid_status"
  | "missing_created_at"
  | "patients_not_array"
  | "patient_not_object"
  | "patient_missing_id"
  | "patient_missing_history_number"
  | "patient_missing_procedure"
  | "patient_invalid_estimated_duration"
  | "patient_missing_anesthesia_type"
  | "patient_missing_insurance_type"
  | "patient_invalid_order_index";

export interface ApiReservationValidationIssue {
  code: ApiReservationReasonCode;
  severity: ApiReservationIssueSeverity;
  reservationId?: string;
  field?: string;
}

export type ApiReservationIssueSeverity = "fatal" | "warning" | "info";

export interface ApiReservationValidationResult {
  ok: boolean;
  issues: ApiReservationValidationIssue[];
  reservationId?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isValidShiftRaw(value: unknown): boolean {
  const raw = asString(value).trim().toLowerCase();
  return raw === "morning" || raw === "afternoon";
}

export function isValidStatusRaw(value: unknown): boolean {
  const raw = asString(value).trim().toLowerCase();
  return raw === "pending" || raw === "confirmed" || raw === "cancelled" || raw === "released";
}

function validatePatient(value: unknown): ApiReservationValidationIssue[] {
  if (!isRecord(value)) return [{ code: "patient_not_object", severity: "fatal", field: "patients[]" }];
  const issues: ApiReservationValidationIssue[] = [];
  if (!isString(value.id) || value.id.length === 0) issues.push({ code: "patient_missing_id", severity: "fatal", field: "patients[].id" });
  if (!isString(value.historyNumber)) issues.push({ code: "patient_missing_history_number", severity: "warning", field: "patients[].historyNumber" });
  if (!isString(value.procedure)) issues.push({ code: "patient_missing_procedure", severity: "warning", field: "patients[].procedure" });
  if (asFiniteNumber(value.estimatedDurationMinutes) === null) {
    issues.push({ code: "patient_invalid_estimated_duration", severity: "fatal", field: "patients[].estimatedDurationMinutes" });
  }
  if (!isString(value.anesthesiaType)) issues.push({ code: "patient_missing_anesthesia_type", severity: "warning", field: "patients[].anesthesiaType" });
  if (!isString(value.insuranceType)) issues.push({ code: "patient_missing_insurance_type", severity: "warning", field: "patients[].insuranceType" });
  if (asFiniteNumber(value.orderIndex) === null) issues.push({ code: "patient_invalid_order_index", severity: "fatal", field: "patients[].orderIndex" });
  return issues;
}

export function validateApiReservationShape(value: unknown): ApiReservationValidationResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: "not_object", severity: "fatal" }] };
  }
  const reservationId = isString(value.id) ? value.id : undefined;
  const issues: ApiReservationValidationIssue[] = [];
  if (!isString(value.id) || value.id.length === 0) issues.push({ code: "missing_id", severity: "fatal", reservationId, field: "id" });
  if (!isString(value.date)) issues.push({ code: "missing_date", severity: "fatal", reservationId, field: "date" });
  if (!isString(value.resourceId)) issues.push({ code: "missing_resource_id", severity: "fatal", reservationId, field: "resourceId" });
  if (!isValidShiftRaw(value.shift)) issues.push({ code: "invalid_shift", severity: "fatal", reservationId, field: "shift" });
  if (asFiniteNumber(value.slotIndex) === null) issues.push({ code: "invalid_slot_index", severity: "fatal", reservationId, field: "slotIndex" });
  if (!isString(value.surgeonId) || value.surgeonId.length === 0) issues.push({ code: "missing_surgeon_id", severity: "fatal", reservationId, field: "surgeonId" });
  if (!isValidStatusRaw(value.status)) issues.push({ code: "invalid_status", severity: "fatal", reservationId, field: "status" });
  if (!isString(value.createdAt)) issues.push({ code: "missing_created_at", severity: "fatal", reservationId, field: "createdAt" });
  if (!Array.isArray(value.patients)) {
    issues.push({ code: "patients_not_array", severity: "fatal", reservationId, field: "patients" });
  } else {
    value.patients.forEach((p) => {
      validatePatient(p).forEach((issue) => issues.push({ ...issue, reservationId }));
    });
  }
  return { ok: issues.length === 0, issues, reservationId };
}

export function hasFatalIssues(result: ApiReservationValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "fatal");
}

export function hasIrrecoverableIssues(result: ApiReservationValidationResult): boolean {
  return result.issues.some(
    (issue) =>
      issue.code === "not_object" ||
      issue.code === "missing_id" ||
      issue.code === "missing_date" ||
      issue.code === "missing_resource_id" ||
      issue.code === "invalid_shift" ||
      issue.code === "invalid_slot_index" ||
      issue.code === "missing_surgeon_id" ||
      issue.code === "invalid_status" ||
      issue.code === "missing_created_at" ||
      issue.code === "patients_not_array"
  );
}
