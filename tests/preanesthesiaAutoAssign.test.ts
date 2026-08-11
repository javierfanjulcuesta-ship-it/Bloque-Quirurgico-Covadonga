import test from "node:test";
import assert from "node:assert/strict";
import {
  madridSlotKeyFromUtc,
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
