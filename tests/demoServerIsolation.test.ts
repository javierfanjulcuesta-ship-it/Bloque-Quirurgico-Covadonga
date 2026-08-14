import assert from "node:assert/strict";
import test from "node:test";

import {
  isIsolatedDemoServerEnabled,
  shouldBlockIsolatedDemoPath,
} from "../src/lib/isolatedDemoServerPolicy";

test("server isolation enables from either explicit isolated-demo signal", () => {
  assert.equal(
    isIsolatedDemoServerEnabled({ QXFLOW_ISOLATED_DEMO: "true" } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    isIsolatedDemoServerEnabled({ NEXT_PUBLIC_DEPLOYMENT_MODE: "isolated-demo" } as NodeJS.ProcessEnv),
    true,
  );
});

test("isolated demo blocks every API surface before route code", () => {
  const env = { QXFLOW_ISOLATED_DEMO: "true" } as NodeJS.ProcessEnv;
  const protectedPaths = [
    "/api/reservations",
    "/api/preanesthesia/demo",
    "/api/users",
    "/api/email/send-invitation",
    "/api/email/webhook",
    "/api/cron/release-pending-reservations",
    "/api/programming-rules",
    "/api/common-pool-releases",
  ];

  for (const pathname of protectedPaths) {
    assert.equal(shouldBlockIsolatedDemoPath(pathname, env), true, pathname);
  }
});

test("server isolation does not block application pages or real mode", () => {
  const isolatedEnv = { QXFLOW_ISOLATED_DEMO: "true" } as NodeJS.ProcessEnv;
  assert.equal(shouldBlockIsolatedDemoPath("/", isolatedEnv), false);
  assert.equal(shouldBlockIsolatedDemoPath("/calendario", isolatedEnv), false);
  assert.equal(shouldBlockIsolatedDemoPath("/api/reservations", {} as NodeJS.ProcessEnv), false);
});
