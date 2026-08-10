import test from "node:test";
import assert from "node:assert/strict";
import { isActiveUserRecord } from "../src/lib/auth/activeUser";

const baseUser = {
  id: "u1",
  email: "user@example.test",
  name: "Usuario Prueba",
  role: "CIRUJANO",
  approved: true,
  deletedAt: null as Date | null,
};

test("active approved user is accepted", () => {
  assert.equal(isActiveUserRecord(baseUser), true);
});

test("unapproved user is rejected", () => {
  assert.equal(isActiveUserRecord({ ...baseUser, approved: false }), false);
});

test("soft-deleted user is rejected", () => {
  assert.equal(isActiveUserRecord({ ...baseUser, deletedAt: new Date() }), false);
});

test("missing user is rejected", () => {
  assert.equal(isActiveUserRecord(null), false);
});
