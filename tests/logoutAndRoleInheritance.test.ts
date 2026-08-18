import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROLE_PERMISSIONS, hasPermission } from "../src/lib/auth/permissions";
import { hasAnesthetistAccess, hasGestorAccess, hasProgrammingAccess } from "../src/lib/types";

test("gestor-anestesista inherits every gestor and anestesista permission", () => {
  const combined = new Set(ROLE_PERMISSIONS["gestor-anestesista"]);

  for (const permission of ROLE_PERMISSIONS.gestor) {
    assert.ok(combined.has(permission), `missing gestor permission: ${permission}`);
    assert.equal(hasPermission("gestor-anestesista", permission), true);
  }

  for (const permission of ROLE_PERMISSIONS.anestesista) {
    assert.ok(combined.has(permission), `missing anestesista permission: ${permission}`);
    assert.equal(hasPermission("gestor-anestesista", permission), true);
  }

  assert.equal(hasGestorAccess("gestor-anestesista"), true);
  assert.equal(hasAnesthetistAccess("gestor-anestesista"), true);
  assert.equal(hasProgrammingAccess("gestor-anestesista"), true);
});

test("logout clears client session before any real logout network wait", () => {
  const source = readFileSync("src/context/AuthContext.tsx", "utf8");
  const logoutStart = source.indexOf("const logout = useCallback(async () => {");
  const clearStorage = source.indexOf("setStoredUser(null);", logoutStart);
  const clearState = source.indexOf("setUserState(null);", logoutStart);
  const logoutFetch = source.indexOf('await fetch("/api/auth/logout"', logoutStart);

  assert.ok(logoutStart >= 0, "logout callback missing");
  assert.ok(clearStorage > logoutStart, "stored session is not cleared during logout");
  assert.ok(clearState > logoutStart, "auth state is not cleared during logout");
  assert.ok(logoutFetch > logoutStart, "real logout endpoint call missing");
  assert.ok(clearStorage < logoutFetch, "sessionStorage must clear before waiting for real logout");
  assert.ok(clearState < logoutFetch, "React auth state must clear before waiting for real logout");
});

test("logout centrally returns non-root workspaces to the access screen", () => {
  const source = readFileSync("src/context/AuthContext.tsx", "utf8");
  const logoutStart = source.indexOf("const logout = useCallback(async () => {");
  const navigation = source.indexOf('window.location.replace("/")', logoutStart);
  const pathnameGuard = source.indexOf('window.location.pathname !== "/"', logoutStart);

  assert.ok(pathnameGuard > logoutStart, "logout must avoid an unnecessary reload while already on access screen");
  assert.ok(navigation > pathnameGuard, "logout must own the final return to the access screen");
});

test("known authenticated workspaces all use the shared AuthContext logout", () => {
  const calendar = readFileSync("src/app/calendario/page.tsx", "utf8");
  const surgeon = readFileSync("src/app/cirujano/page.tsx", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");

  for (const [name, source] of [["calendar", calendar], ["surgeon", surgeon], ["home", home]] as const) {
    assert.match(source, /useAuth\(\)/, `${name} must use the shared auth context`);
    assert.match(source, /logout/, `${name} must expose the shared logout action`);
  }
});
