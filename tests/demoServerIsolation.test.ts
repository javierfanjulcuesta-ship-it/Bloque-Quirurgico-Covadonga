import assert from "node:assert/strict";
import test from "node:test";

import {
  isIsolatedDemoServerEnabled,
  shouldBlockIsolatedDemoPath,
} from "../src/lib/isolatedDemoServerPolicy";

test("server isolation enables from either explicit isolated-demo signal", () => {
  assert.equal(
    isIsolatedDemoServerEnabled({
      runtimeServerFlag: "true",
      buildPublicMode: undefined,
    }),
    true,
  );
  assert.equal(
    isIsolatedDemoServerEnabled({
      runtimeServerFlag: undefined,
      buildPublicMode: "isolated-demo",
    }),
    true,
  );
});

test("build-time isolated-demo signal still blocks API if runtime public env is absent", () => {
  assert.equal(
    shouldBlockIsolatedDemoPath("/api/reservations", {
      runtimeServerFlag: undefined,
      buildPublicMode: "isolated-demo",
    }),
    true,
  );
});

test("isolated demo blocks every API surface before route code", () => {
  const signals = {
    runtimeServerFlag: "true",
    buildPublicMode: undefined,
  };
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
    assert.equal(shouldBlockIsolatedDemoPath(pathname, signals), true, pathname);
  }
});

test("server isolation does not block application pages or real mode", () => {
  const isolatedSignals = {
    runtimeServerFlag: "true",
    buildPublicMode: undefined,
  };
  assert.equal(shouldBlockIsolatedDemoPath("/", isolatedSignals), false);
  assert.equal(shouldBlockIsolatedDemoPath("/calendario", isolatedSignals), false);
  assert.equal(
    shouldBlockIsolatedDemoPath("/api/reservations", {
      runtimeServerFlag: undefined,
      buildPublicMode: undefined,
    }),
    false,
  );
});
