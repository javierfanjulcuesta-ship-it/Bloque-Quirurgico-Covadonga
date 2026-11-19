import assert from "node:assert/strict";
import test from "node:test";

import { isIsolatedDemoRef } from "../src/lib/isolatedDemoBranch";
import { isIsolatedDemoRuntime } from "../src/lib/isolatedDemoRuntime";

test("solo las ramas de demostración quedan aisladas", () => {
  assert.equal(isIsolatedDemoRef("cursor/demo-aislada-a622"), true);
  assert.equal(isIsolatedDemoRef("demo"), true);
  assert.equal(isIsolatedDemoRef("hardening/integration"), false);
  assert.equal(isIsolatedDemoRef("main"), false);
  assert.equal(isIsolatedDemoRef("HEAD"), false);
  assert.equal(isIsolatedDemoRef(undefined), false);
});

test("el runtime aislado no depende de tener DATABASE_URL", () => {
  assert.equal(
    isIsolatedDemoRuntime({
      VERCEL_GIT_COMMIT_REF: "cursor/demo-aislada-a622",
      DATABASE_URL: "postgresql://prod.example/real",
    } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    isIsolatedDemoRuntime({
      NEXT_PUBLIC_DEPLOYMENT_MODE: "isolated-demo",
    } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    isIsolatedDemoRuntime({
      VERCEL_GIT_COMMIT_REF: "hardening/integration",
      DATABASE_URL: "postgresql://prod.example/real",
    } as NodeJS.ProcessEnv),
    false,
  );
});
