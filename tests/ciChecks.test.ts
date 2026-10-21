import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

test("the intake fingerprint migration drops identifying tables after creating them", () => {
  const dirs = readdirSync("prisma/migrations")
    .filter((name) => existsSync(`prisma/migrations/${name}/migration.sql`))
    .sort();
  const createAt = dirs.findIndex((name) => name.includes("intake_rows"));
  const dropAt = dirs.findIndex((name) => name.includes("intake_fingerprints"));
  assert.ok(createAt >= 0 && dropAt > createAt);
  const sql = readFileSync(`prisma/migrations/${dirs[dropAt]}/migration.sql`, "utf8");
  assert.match(sql, /DROP TABLE IF EXISTS "IntakeRow"/);
  assert.match(sql, /DROP TABLE IF EXISTS "PatientIdentity"/);
  assert.match(sql, /CREATE TABLE "IntakeFingerprint"/);
  assert.equal(/patientName|historyNumber|fullName|email|telefono/i.test(sql), false);
});

test("pull requests run unit checks and an empty-database migrate deploy", () => {
  const workflow = readFileSync(".github/workflows/pr-checks.yml", "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /no-identifying-fixture-columns\.mjs/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run lint/);
  assert.equal(workflow.includes("eslint-budget.mjs"), false);
  assert.match(workflow, /prisma migrate deploy/);
  assert.match(workflow, /IntakeRow/);
  assert.equal(/continue-on-error:\s*true/.test(workflow), false);
});
