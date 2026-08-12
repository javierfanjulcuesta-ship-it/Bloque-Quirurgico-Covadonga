import test from "node:test";
import assert from "node:assert/strict";
import { isDependencyReady } from "../src/lib/health/readiness";

test("readiness reports success when the dependency check succeeds", async () => {
  assert.equal(
    await isDependencyReady(async () => undefined),
    true,
  );
});

test("readiness fails closed without leaking dependency errors", async () => {
  assert.equal(
    await isDependencyReady(async () => {
      throw new Error("postgresql://secret-host/should-not-escape");
    }),
    false,
  );
});
