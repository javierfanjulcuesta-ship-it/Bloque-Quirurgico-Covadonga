import assert from "node:assert/strict";
import test from "node:test";
import { buildSurgeonManagementProfiles } from "../src/lib/metrics/surgeonProfileAnalytics";
import type { Reservation, SlotView, User } from "../src/lib/types";

const users: User[] = [
  { id: "surgeon-demo-a", name: "Cirujano Demo A", email: "a@demo.invalid", role: "cirujano", approved: true },
  { id: "surgeon-demo-b", name: "Cirujano Demo B", email: "b@demo.invalid", role: "cirujano", approved: true },
];

const reservations: Reservation[] = [
  {
    id: "res-a-1",
    resourceId: "Q1",
    date: "2026-08-20",
    shift: "morning",
    slotIndex: 0,
    surgeonId: "surgeon-demo-a",
    status: "confirmed",
    createdAt: "2026-08-10T08:00:00.000Z",
    patients: [
      {
        id: "pat-demo-1",
        numeroHistoria: "DEMO-001",
        procedure: "Procedimiento sintético A",
        estimatedDurationMinutes: 90,
        anesthesiaType: "General",
        entidadFinanciadora: "Financiador Demo 1",
        notes: "",
        order: 0,
      },
      {
        id: "pat-demo-2",
        numeroHistoria: "DEMO-002",
        procedure: "Procedimiento sintético B",
        estimatedDurationMinutes: 60,
        anesthesiaType: "Regional",
        entidadFinanciadora: "Financiador Demo 2",
        notes: "",
        order: 1,
      },
    ],
  },
  {
    id: "res-a-2",
    resourceId: "Q2",
    date: "2026-08-22",
    shift: "afternoon",
    slotIndex: 0,
    surgeonId: "surgeon-demo-a",
    status: "released",
    createdAt: "2026-08-21T08:00:00.000Z",
    patients: [],
  },
  {
    id: "res-a-3",
    resourceId: "Q1",
    date: "2026-09-15",
    shift: "morning",
    slotIndex: 0,
    surgeonId: "surgeon-demo-a",
    status: "cancelled",
    createdAt: "2026-09-14T12:00:00.000Z",
    patients: [],
  },
];

const slotViews: SlotView[] = [
  {
    resourceId: "Q1",
    date: "2026-08-20",
    shift: "morning",
    slotIndex: 0,
    status: "occupied",
    reservationId: "res-a-1",
    totalMinutes: 180,
    usedMinutes: 150,
  },
];

test("builds programmed surgeon profile without inventing real activity", () => {
  const profiles = buildSurgeonManagementProfiles({ reservations, slotViews, usersDirectory: users });
  const profile = profiles.find((row) => row.surgeonId === "surgeon-demo-a");
  assert.ok(profile);
  assert.equal(profile.cases, 2);
  assert.equal(profile.reservedMinutes, 180);
  assert.equal(profile.programmedMinutes, 150);
  assert.equal(Math.round(profile.occupancyWithinReservedPct ?? 0), 83);
  assert.equal(profile.releases, 1);
  assert.equal(profile.cancellations, 1);
  assert.equal(profile.actualDataAvailable, false);
  assert.equal(profile.actualMinutes, null);
  assert.equal(profile.actualVsReservedPct, null);
  assert.equal(profile.fundingMix.length, 2);
  assert.equal(profile.fundingMix[0]?.cases, 1);
});

test("adds real aggregate layer only when explicitly supplied", () => {
  const profiles = buildSurgeonManagementProfiles({
    reservations,
    slotViews,
    usersDirectory: users,
    actualAggregates: [
      { surgeonId: "surgeon-demo-a", period: "2026-08", cases: 2, actualMinutes: 165 },
    ],
  });
  const profile = profiles.find((row) => row.surgeonId === "surgeon-demo-a");
  assert.ok(profile);
  assert.equal(profile.actualDataAvailable, true);
  assert.equal(profile.actualCases, 2);
  assert.equal(profile.actualMinutes, 165);
  assert.equal(Math.round(profile.actualVsReservedPct ?? 0), 92);
  assert.equal(Math.round(profile.actualVsProgrammedPct ?? 0), 110);
  assert.equal(profile.monthlyTrend.find((row) => row.month === "2026-08")?.actualMinutes, 165);
});

test("includes approved surgeon directory entries even before activity", () => {
  const profiles = buildSurgeonManagementProfiles({ reservations: [], usersDirectory: users });
  assert.equal(profiles.length, 2);
  const empty = profiles.find((row) => row.surgeonId === "surgeon-demo-b");
  assert.ok(empty);
  assert.equal(empty.reservations, 0);
  assert.equal(empty.actualDataAvailable, false);
});
