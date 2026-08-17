import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("DEMO manager closures are local-only and slot-granular", () => {
  const store = readFileSync("src/lib/demoBlockClosures.ts", "utf8");
  const page = readFileSync("src/app/demo/cierres/page.tsx", "utf8");

  assert.ok(store.includes("localStorage"));
  assert.ok(store.includes("slotIndex"));
  assert.ok(store.includes("closeDemoSlots"));
  assert.ok(store.includes("reopenDemoSlots"));
  assert.ok(store.includes("isDemoSlotClosed"));
  assert.equal(store.includes("fetch("), false, "local DEMO closure store must never call an API");

  assert.ok(page.includes("<DaySlotGrid"), "manager must reuse the booking time-grid interaction");
  assert.ok(page.includes("hasGestorAccess(user.role)"), "closure surface must require manager access");
  assert.ok(page.includes('selectWholeShift("morning")'));
  assert.ok(page.includes('selectWholeShift("afternoon")'));
  assert.ok(page.includes("Cerrar selección"));
  assert.ok(page.includes("Reabrir"));
  assert.equal(page.includes("/api/"), false, "isolated DEMO closure surface must not call backend APIs");
});

test("DEMO reservation creation rejects manager-closed slots before persistence", () => {
  const reservations = readFileSync("src/lib/reservations.ts", "utf8");
  const demoBranch = reservations.indexOf("if (modoDemo) {");
  const closureCheck = reservations.indexOf("isDemoSlotClosed({", demoBranch);
  const rejection = reservations.indexOf("Este tramo está cerrado por gestión en la DEMO.", closureCheck);
  const persistence = reservations.indexOf("addOrUpdateStoredReservation(res);", demoBranch);

  assert.ok(reservations.includes('import { isDemoSlotClosed } from "./demoBlockClosures";'));
  assert.ok(demoBranch >= 0);
  assert.ok(closureCheck > demoBranch, "closure check must occur in DEMO branch");
  assert.ok(rejection > closureCheck, "closed slot must return an explicit conflict");
  assert.ok(persistence > rejection, "closed-slot rejection must happen before local reservation persistence");
});

test("resetDemoStorage clears manager slot closures", () => {
  const reset = readFileSync("src/lib/demoReset.ts", "utf8");
  assert.ok(reset.includes("DEMO_SLOT_CLOSURES_STORAGE_KEY"));
  assert.ok(reset.includes("DEMO_LOCAL_STORAGE_KEYS"));
});
