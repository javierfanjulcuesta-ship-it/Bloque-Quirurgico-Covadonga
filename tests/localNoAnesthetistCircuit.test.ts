import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import {
  LOCAL_NO_ANESTHETIST,
  isLocalWithoutAnesthetist,
} from "../src/lib/reservations/anesthesiaCircuitPolicy";
import { reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction } from "../src/lib/reservations/reconcileAnesthesiaPreanesthesia";

interface FakePatientState {
  isDeferredUrgency: boolean;
  specialCircuitReason: string | null;
}

function fakeTx(params: {
  patient?: FakePatientState;
  occupied?: Array<{ preanesthesiaAppointmentAt: Date | null }>;
}) {
  const updates: Array<Record<string, unknown>> = [];
  let lockCount = 0;
  let occupiedReads = 0;

  const tx = {
    $queryRaw: async () => {
      lockCount += 1;
      return [{ acquired: 1 }];
    },
    patientInBlock: {
      findUnique: async () => params.patient ?? { isDeferredUrgency: false, specialCircuitReason: null },
      findMany: async () => {
        occupiedReads += 1;
        return params.occupied ?? [];
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "patient-demo" };
      },
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    updates,
    get lockCount() { return lockCount; },
    get occupiedReads() { return occupiedReads; },
  };
}

test("special local option is exact and normal Local still requires the anesthesia circuit", () => {
  assert.equal(LOCAL_NO_ANESTHETIST, "Local (no precisa anestesista)");
  assert.equal(isLocalWithoutAnesthetist(LOCAL_NO_ANESTHETIST), true);
  assert.equal(isLocalWithoutAnesthetist("  LOCAL (NO PRECISA ANESTESISTA)  "), true);
  assert.equal(isLocalWithoutAnesthetist("Local"), false);
  assert.equal(isLocalWithoutAnesthetist("Sedación"), false);
});

test("surgeon programming exposes the exact local-without-anesthetist choice alongside normal Local", () => {
  const source = readFileSync("src/components/cirujano/ProgramarPacientesModal.tsx", "utf8");
  assert.match(source, /ANESTHESIA_OPTIONS\s*=\s*\[[^\]]*"Local"[^\]]*"Local \(no precisa anestesista\)"[^\]]*\]/);
});

test("changing a normal anesthesia to local-without-anesthetist clears preanesthesia without consuming capacity", async () => {
  const f = fakeTx({});
  const result = await reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction(f.tx, {
    patientId: "patient-demo",
    surgeryYmd: "2026-08-21",
    previousAnesthesiaType: "General",
    nextAnesthesiaType: LOCAL_NO_ANESTHETIST,
    todayYmd: "2026-08-17",
  });

  assert.deepEqual(result, { kind: "not_required" });
  assert.equal(f.lockCount, 0);
  assert.equal(f.occupiedReads, 0);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0]!.preanesthesiaStatus, "NOT_REQUIRED");
  assert.equal(f.updates[0]!.preanesthesiaAppointmentAt, null);
});

test("changing local-without-anesthetist to normal anesthesia assigns the earliest eligible slot under the global lock", async () => {
  const f = fakeTx({ occupied: [] });
  const result = await reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction(f.tx, {
    patientId: "patient-demo",
    surgeryYmd: "2026-08-21",
    previousAnesthesiaType: LOCAL_NO_ANESTHETIST,
    nextAnesthesiaType: "Sedación",
    todayYmd: "2026-08-17",
  });

  assert.equal(result.kind, "scheduled");
  assert.equal(f.lockCount, 1);
  assert.equal(f.occupiedReads, 1);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0]!.preanesthesiaStatus, "SCHEDULED");
  assert.ok(f.updates[0]!.preanesthesiaAppointmentAt instanceof Date);
});

test("deferred urgency returning to anesthetist-required anesthesia remains manual and receives no automatic slot", async () => {
  const f = fakeTx({ patient: { isDeferredUrgency: true, specialCircuitReason: "Caso sintético" } });
  const result = await reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction(f.tx, {
    patientId: "patient-demo",
    surgeryYmd: "2026-08-21",
    previousAnesthesiaType: LOCAL_NO_ANESTHETIST,
    nextAnesthesiaType: "General",
    todayYmd: "2026-08-17",
  });

  assert.deepEqual(result, { kind: "pending_manual_review" });
  assert.equal(f.lockCount, 0);
  assert.equal(f.occupiedReads, 0);
  assert.equal(f.updates[0]!.preanesthesiaStatus, "PENDING");
  assert.equal(f.updates[0]!.preanesthesiaAppointmentAt, null);
  assert.equal(f.updates[0]!.workflowStatus, "MANUAL_REVIEW_REQUIRED");
});

test("changes between two anesthesia-requiring types do not disturb an existing preanesthesia circuit", async () => {
  const f = fakeTx({});
  const result = await reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction(f.tx, {
    patientId: "patient-demo",
    surgeryYmd: "2026-08-21",
    previousAnesthesiaType: "Regional",
    nextAnesthesiaType: "General",
    todayYmd: "2026-08-17",
  });

  assert.deepEqual(result, { kind: "unchanged" });
  assert.equal(f.updates.length, 0);
  assert.equal(f.lockCount, 0);
});

test("contact-only patient edits no longer reset preanesthesia/financing workflow statuses", () => {
  const source = readFileSync("src/app/api/reservations/[id]/patient/route.ts", "utf8");
  assert.match(source, /const contactOnlyUpdate\s*=/);
  assert.doesNotMatch(source, /Object\.assign\(data,\s*defaultPatientCircuitColumns\(\)\)/);
  assert.doesNotMatch(source, /import\s*\{[\s\S]*defaultPatientCircuitColumns[\s\S]*\}\s*from\s*["']@\/lib\/reservations\/surgicalPatientCircuit["']/);
  assert.match(source, /updates\.anesthesiaType\s*!==\s*undefined[\s\S]*reconcilePreanesthesiaAfterAnesthesiaTypeChangeInTransaction/);
});
