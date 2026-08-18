import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("gestor slot closure workspace uses local storage in DEMO and exact API in real mode", () => {
  const source = readFileSync("src/app/gestor/cierres/page.tsx", "utf8");

  assert.match(source, /hasGestorAccess\(user\.role\)/);
  assert.match(source, /<DaySlotGrid/);
  assert.match(source, /selectWholeShift\("morning"\)/);
  assert.match(source, /selectWholeShift\("afternoon"\)/);
  assert.match(source, /selectResourceShift/);
  assert.match(source, /closeDemoSlots\(selectedSlots\)/);
  assert.match(source, /reopenDemoSlots\(slots\)/);
  assert.match(source, /\/api\/block-slot-opening-plan/);
  assert.match(source, /status: "OPEN" as const/);
  assert.match(source, /applyStatus\("CLOSED"\)/);

  const demoBranch = source.indexOf("if (modoDemo) {");
  const demoClose = source.indexOf("closeDemoSlots(selectedSlots)");
  const realSave = source.indexOf("await saveExactOverrides(selectedSlots.map", demoClose);
  assert.ok(demoBranch >= 0);
  assert.ok(demoClose > demoBranch, "DEMO closure must use local-only storage");
  assert.ok(realSave > demoClose, "real exact-slot API path must stay outside the DEMO branch");
});

test("both gestor workspaces expose the closure control link", () => {
  const source = readFileSync("src/components/ui/WorkspaceQuickActions.tsx", "utf8");
  assert.match(source, /title === "Espacio gestor"/);
  assert.match(source, /title === "Espacio gestor-anestesista"/);
  assert.match(source, /href="\/gestor\/cierres"/);
});
