import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assertPreviewDatabase } from "../scripts/db/databaseTarget.mjs";
import { previewMigrateAllowed } from "../scripts/db/prepare-preview-database.mjs";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:5432/qxflow_preview?schema=public";

test("a local or marked database is accepted and production-looking URLs are not", () => {
  assert.equal(assertPreviewDatabase(LOCAL).database, "qxflow_preview");
  assert.equal(
    assertPreviewDatabase("postgresql://postgres:postgres@127.0.0.1:5432/qxflow_ci").database,
    "qxflow_ci",
  );
  assert.throws(
    () => assertPreviewDatabase("postgresql://user:pass@db.ejemplo.net/bloque"),
    /no está marcada como prueba/,
  );
  assert.throws(
    () => assertPreviewDatabase(LOCAL, LOCAL),
    /PRODUCTION_DATABASE_URL/,
  );
});

test("migrations are not applied unless the preview confirmation is present", () => {
  assert.equal(previewMigrateAllowed({ DATABASE_URL: LOCAL, CONFIRM_PREVIEW_DATABASE: "preparar" }).ok, true);
  assert.equal(previewMigrateAllowed({ DATABASE_URL: LOCAL }).ok, false);
  assert.equal(
    previewMigrateAllowed({
      DATABASE_URL: "postgresql://user:pass@db.ejemplo.net/bloque",
      CONFIRM_PREVIEW_DATABASE: "preparar",
    }).ok,
    false,
  );
});

test("the preview script is not wired into production deploy", () => {
  const workflow = readFileSync(".github/workflows/pr-checks.yml", "utf8");
  const pkg = readFileSync("package.json", "utf8");
  assert.equal(workflow.includes("prepare-preview-database"), false);
  assert.equal(pkg.includes("prepare-preview-database"), false);
  assert.match(workflow, /qxflow_ci/);
});
