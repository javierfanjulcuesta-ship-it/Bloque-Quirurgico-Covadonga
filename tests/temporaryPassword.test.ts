import test from "node:test";
import assert from "node:assert/strict";
import { generateTemporaryPassword } from "../src/lib/auth/temporaryPassword";

test("temporary passwords use safe length and expected alphabet", () => {
  const password = generateTemporaryPassword();
  assert.equal(password.length, 14);
  assert.match(password, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
});

test("temporary password generator rejects weak lengths", () => {
  assert.throws(() => generateTemporaryPassword(10));
  assert.throws(() => generateTemporaryPassword(129));
});

test("temporary password generator produces varied values", () => {
  const generated = new Set(Array.from({ length: 64 }, () => generateTemporaryPassword()));
  assert.equal(generated.size, 64);
});
