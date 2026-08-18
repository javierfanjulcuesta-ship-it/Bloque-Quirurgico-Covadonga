import type { Prisma } from "@prisma/client";
import {
  DEFAULT_PREANESTHESIA_STATUS,
  DEFAULT_WORKFLOW_STATUS,
} from "@/lib/reservations/surgicalCircuitConstants";
import {
  findFirstPreanesthesiaSlotUtc,
  loadPreanesthesiaOccupiedKeys,
  todayYmdMadrid,
} from "@/lib/reservations/preanesthesiaAutoAssign";
import { isLocalWithoutAnesthetist } from "@/lib/reservations/anesthesiaCircuitPolicy";
import {
  PREANESTHESIA_NOT_REQUIRED,
  PREANESTHESIA_SCHEDULED,
  WORKFLOW_MANUAL_REVIEW_REQUIRED,
} from "@/lib/reservations/patientCircuitPhase2";

const PREANESTHESIA_ASSIGNMENT_LOCK_KEY = "qxflow:preanesthesia:autoassign:v1";

export type AnesthesiaPreanesthesiaTransition =
  | { kind: "unchanged" }
  | { kind: "not_required" }
  | { kind: "pending_manual_review" }
  | { kind: "pending_no_slot" }
  | { kind: "scheduled"; preanesthesiaAppointmentAt: string };

async function acquirePreanesthesiaAssignmentLock(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<Array<{ acquired: number }>>`
    SELECT 1::int AS acquired
    FROM pg_advisory_xact_lock(hashtext(${PREANESTHESIA_ASSIGNMENT_LOCK_KEY}))
  `;
}

/**
 * Reconciles only the preanesthesia workflow when an already-programmed patient's
 * anesthesia type crosses the explicit "Local (no precisa anestesista)" boundary.
 * Contact-only edits and changes between two anesthesia-requiring types are no-ops.
 *
 * The caller must already be inside the scheduling transaction that persisted the
 * new anesthesiaType. When a new slot is needed, the same global preanesthesia
 * advisory lock used by automatic assignment is acquired before reading capacity.
 */
export async function reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    patientId: string;
    surgeryYmd: string;
    previousAnesthesiaType: string | null | undefined;
    nextAnesthesiaType: string | null | undefined;
    todayYmd?: string;
  },
): Promise<AnesthesiaPreanesthesiaTransition> {
  const wasWithoutAnesthetist = isLocalWithoutAnesthetist(params.previousAnesthesiaType);
  const isWithoutAnesthetist = isLocalWithoutAnesthetist(params.nextAnesthesiaType);
  if (wasWithoutAnesthetist === isWithoutAnesthetist) return { kind: "unchanged" };

  const current = await tx.patientInBlock.findUnique({
    where: { id: params.patientId },
    select: {
      isDeferredUrgency: true,
      specialCircuitReason: true,
    },
  });
  if (!current) throw new Error("Paciente no encontrado al reconciliar preanestesia");

  if (isWithoutAnesthetist) {
    await tx.patientInBlock.update({
      where: { id: params.patientId },
      data: {
        preanesthesiaStatus: PREANESTHESIA_NOT_REQUIRED,
        preanesthesiaAppointmentAt: null,
        workflowStatus: current.isDeferredUrgency
          ? WORKFLOW_MANUAL_REVIEW_REQUIRED
          : DEFAULT_WORKFLOW_STATUS,
      },
    });
    return { kind: "not_required" };
  }

  // El caso vuelve a requerir anestesiólogo. Las urgencias diferidas siguen el
  // circuito manual existente y nunca reciben una autocita inventada.
  if (current.isDeferredUrgency) {
    await tx.patientInBlock.update({
      where: { id: params.patientId },
      data: {
        preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
        preanesthesiaAppointmentAt: null,
        workflowStatus: WORKFLOW_MANUAL_REVIEW_REQUIRED,
        specialCircuitReason: current.specialCircuitReason,
      },
    });
    return { kind: "pending_manual_review" };
  }

  await acquirePreanesthesiaAssignmentLock(tx);
  const occupiedKeys = await loadPreanesthesiaOccupiedKeys(tx);
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: params.surgeryYmd,
    todayYmd: params.todayYmd ?? todayYmdMadrid(),
    occupiedKeys,
  });

  if (!slot) {
    await tx.patientInBlock.update({
      where: { id: params.patientId },
      data: {
        preanesthesiaStatus: DEFAULT_PREANESTHESIA_STATUS,
        preanesthesiaAppointmentAt: null,
        workflowStatus: DEFAULT_WORKFLOW_STATUS,
        specialCircuitReason: null,
      },
    });
    return { kind: "pending_no_slot" };
  }

  await tx.patientInBlock.update({
    where: { id: params.patientId },
    data: {
      preanesthesiaStatus: PREANESTHESIA_SCHEDULED,
      preanesthesiaAppointmentAt: slot.atUtc,
      workflowStatus: DEFAULT_WORKFLOW_STATUS,
      specialCircuitReason: null,
    },
  });
  return { kind: "scheduled", preanesthesiaAppointmentAt: slot.atUtc.toISOString() };
}
