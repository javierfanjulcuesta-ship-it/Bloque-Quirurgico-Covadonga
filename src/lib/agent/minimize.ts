import { patientInitials } from "@/lib/drafts/parteTemplate";
import { caseLabelFromOrder } from "@/lib/patients/caseLabel";

const SENSITIVE_KEY = /phone|email|correo|hash|dni|nie|nif|password|secret|token|history|historia|fullname|patientname/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || key === "initials";
}

export function stripSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveKeys);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    output[key] = stripSensitiveKeys(inner);
  }
  return output;
}

export interface MinimizedPatient {
  caseLabel: string;
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
    caseLabel?: string | null;
    orderIndex?: number;
    procedure: string;
    estimatedDurationMinutes: number;
    workflowStatus?: string | null;
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
    patients: input.patients.map((patient, index) => ({
      caseLabel: patient.caseLabel?.trim() || caseLabelFromOrder(patient.orderIndex ?? index),
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
