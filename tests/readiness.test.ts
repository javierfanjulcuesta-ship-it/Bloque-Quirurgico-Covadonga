import test from "node:test";
import assert from "node:assert/strict";
import { isDependencyReady } from "../src/lib/health/readiness";

test("readiness reports success when the dependency check succeeds", async () => {
  assert.equal(await isDependencyReady(async () => undefined), true);
});

test("readiness fails closed without leaking dependency errors", async () => {
  assert.equal(
    await isDependencyReady(async () => {
      throw new Error("dependency failed");
    }),
    false,
  );
});

test("readiness fails closed when a dependency check stalls", async () => {
  const startedAt = Date.now();
  const ready = await isDependencyReady(
    async () => new Promise<void>(() => undefined),
    20,
  );

  assert.equal(ready, false);
  assert.ok(Date.now() - startedAt < 500);
});

test("readiness fails closed for an invalid timeout", async () => {
  assert.equal(await isDependencyReady(async () => undefined, 0), false);
});
