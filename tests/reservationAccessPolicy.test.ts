import test from "node:test";
import assert from "node:assert/strict";
import { getReservationDetailAccess } from "../src/lib/reservations/reservationAccessPolicy";

const reservation = {
  id: "r1",
  surgeonId: "surgeon-1",
  createdByUserId: "creator-1",
  anesthetistId: "anes-1",
};

test("gestor and gestor-anestesista receive full reservation detail", () => {
  assert.equal(getReservationDetailAccess({ userId: "g1", role: "gestor" }, reservation), "full");
  assert.equal(getReservationDetailAccess({ userId: "ga1", role: "gestor-anestesista" }, reservation), "full");
});

test("surgeon can only see owned reservation detail", () => {
  assert.equal(getReservationDetailAccess({ userId: "surgeon-1", role: "cirujano" }, reservation), "full");
  assert.equal(getReservationDetailAccess({ userId: "surgeon-2", role: "cirujano" }, reservation), "denied");
});

test("endoscopist cannot read arbitrary reservation detail", () => {
  assert.equal(getReservationDetailAccess({ userId: "endo-2", role: "endoscopista" }, reservation), "denied");
});

test("assigned anesthetist receives schedule-only access", () => {
  assert.equal(getReservationDetailAccess({ userId: "anes-1", role: "anestesista" }, reservation), "schedule-only");
});

test("unassigned anesthetist cannot read arbitrary reservation detail", () => {
  assert.equal(getReservationDetailAccess({ userId: "anes-2", role: "anestesista" }, reservation), "denied");
});

test("missing session is denied", () => {
  assert.equal(getReservationDetailAccess(null, reservation), "denied");
});
