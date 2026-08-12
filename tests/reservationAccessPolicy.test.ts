import test from "node:test";
import assert from "node:assert/strict";
import { getReservationDetailAccess } from "../src/lib/reservations/reservationAccessPolicy";
import {
  assignmentCoversReservation,
  assignmentCoverageKeys,
  coverageKeysMatchReservation,
} from "../src/lib/reservations/anesthetistAssignmentAccess";

const reservation = {
  id: "r1",
  surgeonId: "surgeon-1",
  createdByUserId: "creator-1",
  anesthetistId: "anes-1",
  assignedAnesthetistIds: ["anes-canonical"],
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

test("legacy assigned anesthetist receives schedule-only access", () => {
  assert.equal(getReservationDetailAccess({ userId: "anes-1", role: "anestesista" }, reservation), "schedule-only");
});

test("canonical AnesthetistAssignment grants schedule-only access", () => {
  assert.equal(
    getReservationDetailAccess({ userId: "anes-canonical", role: "anestesista" }, reservation),
    "schedule-only",
  );
});

test("unassigned anesthetist cannot read arbitrary reservation detail", () => {
  assert.equal(getReservationDetailAccess({ userId: "anes-2", role: "anestesista" }, reservation), "denied");
});

test("missing session is denied", () => {
  assert.equal(getReservationDetailAccess(null, reservation), "denied");
});

test("OR resource assignment covers only matching date, shift and resource", () => {
  const assignment = {
    date: "2031-02-03",
    shift: "MORNING" as const,
    assignmentType: "OR" as const,
    resourceId: "Q2",
  };
  assert.equal(
    assignmentCoversReservation(assignment, {
      date: new Date("2031-02-03T00:00:00.000Z"),
      shift: "MORNING",
      resourceId: "Q2",
    }),
    true,
  );
  assert.equal(
    assignmentCoversReservation(assignment, {
      date: new Date("2031-02-03T00:00:00.000Z"),
      shift: "AFTERNOON",
      resourceId: "Q2",
    }),
    false,
  );
  assert.equal(
    assignmentCoversReservation(assignment, {
      date: new Date("2031-02-03T00:00:00.000Z"),
      shift: "MORNING",
      resourceId: "Q1",
    }),
    false,
  );
});

test("full-shift OR assignment covers every OR resource but preanesthesia never does", () => {
  const reservationContext = {
    date: "2031-02-03",
    shift: "MORNING" as const,
    resourceId: "tecnicas-dolor",
  };
  assert.equal(
    assignmentCoversReservation(
      {
        date: "2031-02-03",
        shift: "MORNING",
        assignmentType: "OR",
        resourceId: "__full_shift__",
      },
      reservationContext,
    ),
    true,
  );
  assert.equal(
    assignmentCoversReservation(
      {
        date: "2031-02-03",
        shift: "MORNING",
        assignmentType: "PREANESTHESIA",
        resourceId: "__preanestesia__",
      },
      reservationContext,
    ),
    false,
  );
});

test("coverage key lookup recognizes exact and full-shift assignments", () => {
  const keys = assignmentCoverageKeys([
    { date: "2031-02-03", shift: "MORNING", assignmentType: "OR", resourceId: "Q1" },
    { date: "2031-02-04", shift: "AFTERNOON", assignmentType: "OR", resourceId: "__full_shift__" },
  ]);
  assert.equal(
    coverageKeysMatchReservation(keys, { date: "2031-02-03", shift: "MORNING", resourceId: "Q1" }),
    true,
  );
  assert.equal(
    coverageKeysMatchReservation(keys, { date: "2031-02-03", shift: "MORNING", resourceId: "Q2" }),
    false,
  );
  assert.equal(
    coverageKeysMatchReservation(keys, { date: "2031-02-04", shift: "AFTERNOON", resourceId: "Q3" }),
    true,
  );
});
