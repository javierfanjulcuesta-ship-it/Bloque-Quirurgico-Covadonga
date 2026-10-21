import { patientInitials } from "@/lib/drafts/parteTemplate";

const SENSITIVE_KEY = /phone|email|correo|hash|dni|nie|nif|password|secret|token/i;

export function stripSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveKeys);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) continue;
    output[key] = stripSensitiveKeys(inner);
  }
  return output;
}

export interface MinimizedPatient {
  historyNumber: string;
  initials: string;
  procedure: string;
  minutes: number;
  workflowStatus: string;
}

export interface MinimizedReservation {
  id: string;
  date: string;
  resourceId: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
  surgeonInitials: string;
  patients: MinimizedPatient[];
}

export function minimizeReservation(input: {
  id: string;
  date: string;
  resourceId: string;
  shift: string;
  slotIndex: number;
  surgeonName?: string | null;
  patients: Array<{
    historyNumber: string;
    fullName?: string | null;
    procedure: string;
    estimatedDurationMinutes: number;
    workflowStatus?: string | null;
    patientPhone?: string | null;
    patientEmail?: string | null;
  }>;
}): MinimizedReservation {
  const shift = input.shift.toLowerCase() === "afternoon" ? "afternoon" : "morning";
  return {
    id: input.id,
    date: input.date,
    resourceId: input.resourceId,
    shift,
    slotIndex: input.slotIndex,
    surgeonInitials: patientInitials(input.surgeonName),
    patients: input.patients.map((patient) => ({
      historyNumber: patient.historyNumber,
      initials: patientInitials(patient.fullName),
      procedure: patient.procedure,
      minutes: patient.estimatedDurationMinutes,
      workflowStatus: patient.workflowStatus ?? "ACTIVE",
    })),
  };
}

export const PROPOSAL_TYPES = ["MOVE_PATIENT", "ASSIGN_ROOM", "FLAG_CONFLICT", "DRAFT_PARTE", "INTAKE_EMAIL"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export function isProposalType(value: unknown): value is ProposalType {
  return typeof value === "string" && (PROPOSAL_TYPES as readonly string[]).includes(value);
}
