import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { matchSurgeon, parseMasterWorkbook, reviewMasterImport } from "../src/lib/intake/masterWorkbook";
import { buildWeekWorkbook } from "../src/lib/intake/weekWorkbook";

const SALT = "sal-de-prueba-no-usar-en-produccion-01";

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADERS = ["Historia", "Nombre", "Procedimiento", "Fecha", "Turno", "Quirófano", "Cirujano", "Hora", "Minutos"];

test("master review stays in memory and stored fingerprints do not contain the patient text", () => {
  const parsed = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [
      HEADERS,
      ["TEST-0001", "Paciente Prueba 01", "Procedimiento prueba", "2031-10-24", "mañana", "Q1", "Muel", "10:30", 40],
      ["TEST-0001", "Paciente Prueba 01", "Procedimiento prueba", "24/10/2031", "mañana", "Sala rara", "Muel", "10:30", 40],
    ],
    DATOS_IQ: [
      HEADERS,
      ["TEST-0002", "Paciente Prueba 02", "Procedimiento prueba dos", "2031-10-24", "", "", "Corona", "", 30],
    ],
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.rows[0]?.slotIndex, 2);
  assert.equal(parsed.rows[1]?.resourceId, null);
  const endo = parseMasterWorkbook(workbook({
    DATOS_IQ: [HEADERS, ["TEST-0003", "Paciente Prueba 03", "Procedimiento prueba", "2031-10-24", "mañana", "Endoscopias", "Corona", "08:00", 20]],
  }));
  assert.equal(endo.ok, true);
  if (endo.ok) assert.equal(endo.rows[0]?.resourceId, "ENDO");
  const review = reviewMasterImport({ salt: SALT, existing: [], incoming: parsed.rows });
  assert.equal(review.publicRows.length, 3);
  assert.equal(review.publicRows.filter((row) => row.status === "DUPLICATE").length, 1);
  assert.equal(review.fingerprints.length, 2);
  const stored = JSON.stringify(review.fingerprints);
  assert.equal(stored.includes("TEST-0001"), false);
  assert.equal(stored.includes("Paciente Prueba"), false);
  assert.equal(stored.includes("Procedimiento prueba"), false);
  const visible = JSON.stringify(review.publicRows);
  assert.equal(visible.includes("TEST-0001"), false);
  assert.equal(visible.includes("Paciente Prueba"), false);
  assert.equal(review.parte.includes("Paciente Prueba"), false);
  assert.equal(review.parte.includes("TEST-0001"), false);
  assert.match(review.parte, /P\.P\.0\./);
  const second = review.publicRows.find((row) => row.procedure === "Procedimiento prueba dos");
  assert.equal(second?.shift, null);
  assert.ok(second?.flags.includes("TURNO_INFERIDO"));
});

test("a DNI column is rejected and a shorter later file is only a missing count", () => {
  const rejected = parseMasterWorkbook(workbook({
    DATOS_IQ: [["Historia", "Nombre", "Procedimiento", "Fecha", "DNI"], ["TEST-0009", "Paciente Prueba 09", "Procedimiento prueba", "2031-10-24", "VALOR-NO-PERMITIDO"]],
  }));
  assert.deepEqual(rejected, { ok: false, error: "dni_column" });
  assert.equal(JSON.stringify(rejected).includes("VALOR-NO-PERMITIDO"), false);
  assert.equal(JSON.stringify(rejected).includes("TEST-0009"), false);

  const first = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [
      HEADERS,
      ["TEST-0001", "Paciente Prueba 01", "Procedimiento prueba", "2031-10-24", "mañana", "Q1", "Muel", "08:00", 40],
      ["TEST-0002", "Paciente Prueba 02", "Procedimiento prueba dos", "2031-10-24", "mañana", "Q1", "Corona", "09:30", 30],
    ],
  }));
  const second = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [HEADERS, ["TEST-0001", "Paciente Prueba 01", "Procedimiento prueba", "2031-10-24", "mañana", "Q1", "Muel", "08:00", 40]],
  }));
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  const stored = reviewMasterImport({ salt: SALT, existing: [], incoming: first.rows });
  const later = reviewMasterImport({ salt: SALT, existing: stored.fingerprints, incoming: second.rows });
  assert.equal(later.batchStatus, "FUENTE_INCOMPLETA");
  assert.equal(later.missingCount, 1);
  assert.equal(later.fingerprints.length, 0);
  assert.equal(JSON.stringify(later).includes("TEST-0002"), false);
});

test("a different name for the same history is flagged and the stored name fingerprint stays", () => {
  const first = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [HEADERS, ["TEST-0001", "Paciente Prueba 01", "Procedimiento prueba", "2031-10-24", "mañana", "Q1", "Muel", "08:00", 40]],
  }));
  const renamed = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [HEADERS, ["TEST-0001", "Paciente Prueba Distinto", "Procedimiento prueba dos", "2031-10-24", "tarde", "Q2", "Blanco", "15:00", 50]],
  }));
  assert.equal(first.ok && renamed.ok, true);
  if (!first.ok || !renamed.ok) return;
  const stored = reviewMasterImport({ salt: SALT, existing: [], incoming: first.rows });
  const review = reviewMasterImport({ salt: SALT, existing: stored.fingerprints, incoming: renamed.rows });
  assert.equal(review.publicRows[0]?.status, "NOMBRE_DIVERGENTE");
  assert.equal(review.fingerprints[0]?.nameFingerprint, stored.fingerprints[0]?.nameFingerprint);
  assert.equal(JSON.stringify(review.fingerprints).includes("Distinto"), false);
  assert.equal(matchSurgeon("Iglesias", [
    { id: "a", name: "Iglesias Alonso" },
    { id: "b", name: "Iglesias Montero" },
  ]).ok, false);
});

test("week export and the import route do not persist patient identifiers", () => {
  const bytes = buildWeekWorkbook({
    program: [{
      date: "2031-10-24",
      shift: "morning",
      slotIndex: 2,
      resourceId: "Q1",
      surgeonName: "Muel",
      procedure: "Procedimiento prueba",
      minutes: 40,
    }],
    changes: [{
      createdAt: "2031-10-20T09:00:00.000Z",
      changeType: "SUSPENSION",
      reasonCode: "SIN_SEGURO",
    }],
  });
  const book = XLSX.read(bytes, { type: "buffer" });
  assert.deepEqual(book.SheetNames, ["1_PROGRAMA", "5_CAMBIOS"]);
  const text = JSON.stringify(book);
  assert.equal(/historia|iniciales|telefono|email|dni/i.test(text), false);
  const exportRoute = readFileSync("src/app/api/intake/week-export/route.ts", "utf8");
  const importRoute = readFileSync("src/app/api/intake/import/route.ts", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.equal(exportRoute.includes("fullName"), false);
  assert.equal(exportRoute.includes("historyNumber"), false);
  assert.equal(exportRoute.includes("patientPhone"), false);
  assert.equal(importRoute.includes("createReservationInDb"), false);
  assert.equal(importRoute.includes("outboundDraft"), false);
  assert.equal(importRoute.includes("patientIdentity"), false);
  assert.equal(importRoute.includes("intakeRow"), false);
  assert.match(schema, /model IntakeFingerprint/);
  assert.equal(/model IntakeRow\b|model PatientIdentity\b/.test(schema), false);
  assert.match(schema, /model PatientIdentityRecord/);
  assert.match(readFileSync(".gitignore", "utf8"), /\/prisma\/\*\.db/);
});
