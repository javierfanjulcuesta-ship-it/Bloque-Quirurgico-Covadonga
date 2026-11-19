import assert from "node:assert/strict";
import test from "node:test";

import { isIsolatedDemoRef } from "../src/lib/isolatedDemoBranch";
import { isIsolatedDemoRuntime } from "../src/lib/isolatedDemoRuntime";

function withEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

test("solo las ramas de demostración quedan aisladas", () => {
  assert.equal(isIsolatedDemoRef("cursor/demo-aislada-a622"), true);
  assert.equal(isIsolatedDemoRef("demo"), true);
  assert.equal(isIsolatedDemoRef("hardening/integration"), false);
  assert.equal(isIsolatedDemoRef("main"), false);
  assert.equal(isIsolatedDemoRef("HEAD"), false);
  assert.equal(isIsolatedDemoRef(undefined), false);
});

test("el runtime aislado no depende de tener DATABASE_URL", () => {
  assert.equal(isIsolatedDemoRuntime(withEnv({ VERCEL_GIT_COMMIT_REF: "cursor/demo-aislada-a622" })), true);
  assert.equal(isIsolatedDemoRuntime(withEnv({ NEXT_PUBLIC_DEPLOYMENT_MODE: "isolated-demo" })), true);
  assert.equal(isIsolatedDemoRuntime(withEnv({ VERCEL_GIT_COMMIT_REF: "hardening/integration" })), false);
});
