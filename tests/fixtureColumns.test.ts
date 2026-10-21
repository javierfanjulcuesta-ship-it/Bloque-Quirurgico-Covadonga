import assert from "node:assert/strict";
import test from "node:test";
import {
  collectFixtureFiles,
  findIdentifyingColumns,
  lineHasIdentifyingColumn,
} from "../scripts/ci/no-identifying-fixture-columns.mjs";

test("a DNI or phone column is rejected", () => {
  assert.equal(lineHasIdentifyingColumn("Historia,Nombre,Procedimiento"), false);
  assert.equal(lineHasIdentifyingColumn("Historia,DNI,Nombre"), true);
  assert.equal(lineHasIdentifyingColumn("Nombre;Teléfono;Email"), true);
  assert.equal(lineHasIdentifyingColumn('patientPhone: "600000000"'), true);
  assert.equal(lineHasIdentifyingColumn("el parte no guarda el teléfono del paciente"), false);
});

test("checked fixtures have no DNI or phone columns", () => {
  assert.deepEqual(findIdentifyingColumns(collectFixtureFiles()), []);
});
