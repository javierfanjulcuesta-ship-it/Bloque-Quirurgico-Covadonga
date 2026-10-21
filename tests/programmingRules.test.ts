import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveProgrammingRule } from "../src/lib/programmingRules";

test("an empty ProgrammingRule table falls back to the local constants", () => {
  assert.equal(resolveProgrammingRule("scheduling_deadline_day", []), 4);
  assert.equal(resolveProgrammingRule("transition_minutes", []), 10);
  assert.equal(resolveProgrammingRule("max_weeks_ahead", []), 4);
  const normas = resolveProgrammingRule("normas_texto_completo", []);
  assert.equal(typeof normas, "object");
  assert.match(String((normas as { text: string }).text), /quirófano|quirofano|bloque/i);
});

test("a stored active rule wins and a missing key does not fall back when the table has rows", () => {
  const rows = [
    { key: "transition_minutes", valueJson: "25", isActive: true },
    { key: "scheduling_deadline_day", valueJson: "3", isActive: false },
  ];
  assert.equal(resolveProgrammingRule("transition_minutes", rows), 25);
  assert.equal(resolveProgrammingRule("scheduling_deadline_day", rows), null);
  assert.equal(resolveProgrammingRule("max_weeks_ahead", rows), null);
});

test("the helper reads ProgrammingRule and no longer claims the table is missing", () => {
  const source = readFileSync("src/lib/programmingRules.ts", "utf8");
  assert.match(source, /programmingRule\.findMany/);
  assert.equal(/no existe en schema/i.test(source), false);
  assert.match(source, /solo se usan cuando esa tabla no tiene ninguna fila/);
});
