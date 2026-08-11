import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBasicBookingPolicy, madridDateOnly } from "../src/lib/reservations/bookingPolicy";

const NOW = new Date("2031-01-06T10:00:00.000Z"); // lunes; también 2031-01-06 en Europe/Madrid

test("madridDateOnly is independent of UTC date around midnight", () => {
  assert.equal(madridDateOnly(new Date("2031-01-05T23:30:00.000Z")), "2031-01-06");
});

test("booking policy rejects impossible dates and weekends", () => {
  const invalid = evaluateBasicBookingPolicy({
    date: "2031-02-30",
    resourceId: "Q1",
    responsibleRole: "CIRUJANO",
    isCoordinator: false,
    now: NOW,
  });
  assert.deepEqual(invalid.ok ? null : invalid.reason, "invalid_date");

  const weekend = evaluateBasicBookingPolicy({
    date: "2031-01-11",
    resourceId: "Q1",
    responsibleRole: "CIRUJANO",
    isCoordinator: false,
    now: NOW,
  });
  assert.deepEqual(weekend.ok ? null : weekend.reason, "weekend");
});

test("booking policy rejects past dates", () => {
  const result = evaluateBasicBookingPolicy({
    date: "2031-01-03",
    resourceId: "Q1",
    responsibleRole: "CIRUJANO",
    isCoordinator: false,
    now: NOW,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "past_date");
});

test("non-coordinator is limited to 28 days; coordinator may exceed horizon", () => {
  const normal = evaluateBasicBookingPolicy({
    date: "2031-02-04", // 29 días
    resourceId: "Q1",
    responsibleRole: "CIRUJANO",
    isCoordinator: false,
    now: NOW,
  });
  assert.equal(normal.ok, false);
  if (!normal.ok) assert.equal(normal.reason, "too_far_ahead");

  const coordinator = evaluateBasicBookingPolicy({
    date: "2031-02-04",
    resourceId: "Q1",
    responsibleRole: "CIRUJANO",
    isCoordinator: true,
    now: NOW,
  });
  assert.deepEqual(coordinator, { ok: true });
});

test("endoscopist can only reserve procedural/dolor resources", () => {
  const q1 = evaluateBasicBookingPolicy({
    date: "2031-01-07",
    resourceId: "Q1",
    responsibleRole: "ENDOSCOPISTA",
    isCoordinator: false,
    now: NOW,
  });
  assert.equal(q1.ok, false);
  if (!q1.ok) assert.equal(q1.reason, "resource_not_allowed");

  const procedures = evaluateBasicBookingPolicy({
    date: "2031-01-07",
    resourceId: "procedimientos-menores",
    responsibleRole: "ENDOSCOPISTA",
    isCoordinator: false,
    now: NOW,
  });
  assert.deepEqual(procedures, { ok: true });

  const pain = evaluateBasicBookingPolicy({
    date: "2031-01-07",
    resourceId: "tecnicas-dolor",
    responsibleRole: "endoscopista",
    isCoordinator: false,
    now: NOW,
  });
  assert.deepEqual(pain, { ok: true });
});
