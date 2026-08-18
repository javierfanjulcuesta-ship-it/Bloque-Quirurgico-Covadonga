import test from "node:test";
import assert from "node:assert/strict";
import { canReserveSlot, type DbClient } from "../src/lib/blockOpeningPlan";

function fakeDb(slotStatus: "OPEN" | "CLOSED" | "URGENT_RESERVED" | null, shiftStatus: "OPEN" | "CLOSED" | "URGENT_RESERVED" | null) {
  const calls: string[] = [];
  const db = {
    blockSlotOpeningPlan: {
      async findUnique() {
        calls.push("slot");
        return slotStatus ? { status: slotStatus } : null;
      },
    },
    blockOpeningPlan: {
      async findUnique() {
        calls.push("shift");
        return shiftStatus ? { status: shiftStatus } : null;
      },
    },
  } as unknown as DbClient;
  return { db, calls };
}

test("exact CLOSED slot blocks surgeon even when shift is OPEN", async () => {
  const { db, calls } = fakeDb("CLOSED", "OPEN");
  const result = await canReserveSlot("2026-08-24", "Q1", "morning", 2, false, db);
  assert.deepEqual(result, {
    ok: false,
    reason: "block_closed",
    message: "Este tramo horario está cerrado para reservas.",
  });
  assert.deepEqual(calls, ["slot"]);
});

test("OPEN slot override can reopen one exact slot inside a CLOSED shift", async () => {
  const { db, calls } = fakeDb("OPEN", "CLOSED");
  const result = await canReserveSlot("2026-08-24", "Q1", "morning", 2, false, db);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ["slot"]);
});

test("without slot override the existing whole-shift CLOSED semantics still apply", async () => {
  const { db, calls } = fakeDb(null, "CLOSED");
  const result = await canReserveSlot("2026-08-24", "Q1", "morning", 2, false, db);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "block_closed");
  assert.deepEqual(calls, ["slot", "shift"]);
});

test("gestor override remains allowed without reading closure state", async () => {
  const { db, calls } = fakeDb("CLOSED", "CLOSED");
  const result = await canReserveSlot("2026-08-24", "Q1", "morning", 2, true, db);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, []);
});
