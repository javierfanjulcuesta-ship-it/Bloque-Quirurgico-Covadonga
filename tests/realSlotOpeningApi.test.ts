import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/block-slot-opening-plan/route.ts", "utf8");

test("real slot-opening API is manager-gated and batch/slot granular", () => {
  assert.ok(route.includes('requirePermission(session!, "or:open_close")'));
  assert.ok(route.includes("slotIndex"));
  assert.ok(route.includes('status: z.enum(["OPEN", "CLOSED", "URGENT_RESERVED"])'));
  assert.ok(route.includes("MAX_BATCH_SLOTS"));
  assert.ok(route.includes("getSlots(item.shift).length"));
});

test("real slot-opening batch is atomic and locks scheduling contexts before writes", () => {
  const transaction = route.indexOf("prisma.$transaction(async (tx) =>");
  const acquire = route.indexOf("acquireSchedulingContextLock(tx, context)", transaction);
  const upsert = route.indexOf("tx.blockSlotOpeningPlan.upsert({", transaction);
  assert.ok(transaction >= 0);
  assert.ok(acquire > transaction);
  assert.ok(upsert > acquire, "all context locks must be acquired before slot writes");
  assert.ok(route.includes("contexts") && route.includes(".sort("), "context locks should use stable ordering");
});

test("OPEN is an explicit exact-slot override so a slot can reopen inside a CLOSED shift", () => {
  assert.ok(route.includes('"OPEN", "CLOSED", "URGENT_RESERVED"'));
  assert.ok(route.includes("update: {\n            status: item.status"));
  assert.ok(route.includes("create: {"));
});

test("GET is range-bounded and does not expose approval/user internals", () => {
  assert.ok(route.includes("Rango máximo 93 días"));
  const responseMapping = route.indexOf("slots: rows.map((row) => ({");
  assert.ok(responseMapping >= 0);
  const responseTail = route.slice(responseMapping, route.indexOf("})),", responseMapping) + 4);
  assert.equal(responseTail.includes("approvedByUserId"), false);
});
