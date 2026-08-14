import assert from "node:assert/strict";
import test from "node:test";

import { resolveDemoMode, resolveUseRealReservationsApi } from "../src/lib/config";

test("isolated-demo is explicit and works in production builds", () => {
  const demo = resolveDemoMode({
    nodeEnv: "production",
    deploymentMode: "isolated-demo",
    legacyDemoEnv: "false",
  });

  assert.equal(demo, true);
  assert.equal(
    resolveUseRealReservationsApi({
      nodeEnv: "production",
      demoMode: demo,
      deploymentMode: "isolated-demo",
      useRealApiEnv: "true",
    }),
    false,
  );
});

test("production never activates demo without exact isolated-demo mode", () => {
  for (const deploymentMode of [undefined, "demo", "preview", "production"]) {
    const demo = resolveDemoMode({
      nodeEnv: "production",
      deploymentMode,
      legacyDemoEnv: undefined,
    });
    assert.equal(demo, false);
    assert.equal(
      resolveUseRealReservationsApi({
        nodeEnv: "production",
        demoMode: demo,
        deploymentMode,
        useRealApiEnv: "false",
      }),
      true,
    );
  }
});

test("legacy development demo behavior remains available", () => {
  assert.equal(
    resolveDemoMode({
      nodeEnv: "development",
      deploymentMode: undefined,
      legacyDemoEnv: undefined,
    }),
    true,
  );
  assert.equal(
    resolveDemoMode({
      nodeEnv: "development",
      deploymentMode: undefined,
      legacyDemoEnv: "false",
    }),
    false,
  );
});
