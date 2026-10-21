import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { eslintBudgetDiff, countEslintErrors } from "../scripts/ci/eslint-budget.mjs";

test("the eslint budget fails only when a file grows past its recorded errors", () => {
  const allowed = { "src/app/example.tsx:react-hooks/set-state-in-effect": 1 };
  assert.deepEqual(eslintBudgetDiff({ "src/app/example.tsx:react-hooks/set-state-in-effect": 1 }, allowed), []);
  assert.deepEqual(eslintBudgetDiff({}, allowed), []);
  const problems = eslintBudgetDiff(
    {
      "src/app/example.tsx:react-hooks/set-state-in-effect": 2,
      "src/lib/new.ts:@typescript-eslint/no-explicit-any": 1,
    },
    allowed,
  );
  assert.equal(problems.length, 2);
  assert.match(problems.join("\n"), /new\.ts/);
  assert.match(problems.join("\n"), /example\.tsx/);
});

test("eslint error counts ignore warnings and stay relative to the repo", () => {
  const counts = countEslintErrors(
    [
      {
        filePath: `${process.cwd()}/src/lib/example.ts`,
        messages: [
          { severity: 1, ruleId: "react-hooks/exhaustive-deps" },
          { severity: 2, ruleId: "@typescript-eslint/no-explicit-any" },
          { severity: 2, ruleId: "@typescript-eslint/no-explicit-any" },
        ],
      },
    ],
    process.cwd(),
  );
  assert.deepEqual(counts, { "src/lib/example.ts:@typescript-eslint/no-explicit-any": 2 });
});

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
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /eslint-budget\.mjs/);
  assert.match(workflow, /prisma migrate deploy/);
  assert.match(workflow, /IntakeRow/);
  assert.equal(/continue-on-error:\s*true/.test(workflow), false);
});
