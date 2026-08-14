import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resetSource = readFileSync("src/lib/demoReset.ts", "utf8");

test("resetDemoStorage clears the isolated DEMO audit namespace", () => {
  assert.ok(resetSource.includes('import { DEMO_AUDIT_STORAGE_KEY } from "./demoAudit"'));
  assert.ok(resetSource.includes("DEMO_AUDIT_STORAGE_KEY,"));
  assert.ok(resetSource.includes("DEMO_LOCAL_STORAGE_KEYS.forEach"));
  assert.ok(resetSource.includes("window.localStorage.removeItem(key)"));
});
