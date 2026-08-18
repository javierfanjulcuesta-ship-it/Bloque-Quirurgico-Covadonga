import test from "node:test";
import assert from "node:assert/strict";
import {
  PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT,
  PREANESTHESIA_SLOTS_PER_DAY,
  findFirstPreanesthesiaSlotUtc,
  madridSlotKeyFromUtc,
  minutesToHm,
  utcDateForMadridWallClock,
} from "../src/lib/reservations/preanesthesiaAutoAssign";

test("Madrid wall-clock conversion is correct in winter", () => {
  const utc = utcDateForMadridWallClock("2031-01-06", 10, 0);
  assert.equal(madridSlotKeyFromUtc(utc), "2031-01-06|10:00");
});

test("Madrid wall-clock conversion is correct in summer DST", () => {
  const utc = utcDateForMadridWallClock("2031-07-07", 12, 30);
  assert.equal(madridSlotKeyFromUtc(utc), "2031-07-07|12:30");
});

test("approved preanesthesia grid is 16 ten-minute starts from 10:00 through 12:30", () => {
  assert.equal(PREANESTHESIA_SLOTS_PER_DAY, 16);
  assert.equal(PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT.length, 16);
  assert.equal(minutesToHm(PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT[0]!), "10:00");
  assert.equal(minutesToHm(PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT.at(-1)!), "12:30");
  for (let i = 1; i < PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT.length; i++) {
    assert.equal(
      PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT[i]! - PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT[i - 1]!,
      10,
    );
  }
});

test("assigns the earliest free Monday slot before surgery", () => {
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: "2026-08-21",
    todayYmd: "2026-08-17",
    occupiedKeys: new Set(),
  });
  assert.ok(slot);
  assert.equal(slot.key, "2026-08-17|10:00");
});

test("uses the next ten-minute slot when an earlier slot is occupied", () => {
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: "2026-08-21",
    todayYmd: "2026-08-17",
    occupiedKeys: new Set(["2026-08-17|10:00"]),
  });
  assert.ok(slot);
  assert.equal(slot.key, "2026-08-17|10:10");
});

test("moves from a full Monday to the following Thursday", () => {
  const mondayOccupied = new Set(
    PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT.map((minutes) => `2026-08-17|${minutesToHm(minutes)}`),
  );
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: "2026-08-21",
    todayYmd: "2026-08-17",
    occupiedKeys: mondayOccupied,
  });
  assert.ok(slot);
  assert.equal(slot.key, "2026-08-20|10:00");
});

test("never assigns preanesthesia on the surgery day", () => {
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: "2026-08-20",
    todayYmd: "2026-08-20",
    occupiedKeys: new Set(),
  });
  assert.equal(slot, null);
});

test("returns no slot when all eligible capacity before surgery is occupied", () => {
  const occupied = new Set<string>();
  for (const day of ["2026-08-17", "2026-08-20"]) {
    for (const minutes of PREANESTHESIA_SLOT_MINUTES_FROM_MIDNIGHT) {
      occupied.add(`${day}|${minutesToHm(minutes)}`);
    }
  }
  const slot = findFirstPreanesthesiaSlotUtc({
    surgeryYmd: "2026-08-21",
    todayYmd: "2026-08-17",
    occupiedKeys: occupied,
  });
  assert.equal(slot, null);
});
