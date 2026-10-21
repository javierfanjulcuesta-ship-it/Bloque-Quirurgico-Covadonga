import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  canApproveIntakeRow,
  matchSurgeon,
  parseMasterWorkbook,
  planMasterImport,
} from "../src/lib/intake/masterWorkbook";
import { buildWeekWorkbook } from "../src/lib/intake/weekWorkbook";

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADERS = ["Historia", "Nombre", "Procedimiento", "Fecha", "Turno", "Quirófano", "Cirujano", "Hora", "Minutos"];

test("master import reads named sheets, keeps an unknown room empty and dedups history date and procedure", () => {
  const parsed = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [
      HEADERS,
      ["HC1", "Ana López", "Artroscopia", "2031-10-24", "mañana", "Q1", "Muel", "10:30", 40],
      ["HC1", "Ana Lopez", "artroscopia", "24/10/2031", "mañana", "Sala rara", "Muel", "10:30", 40],
    ],
    DATOS_IQ: [
      HEADERS,
      ["HC2", "Luis Corona", "Hernia", "2031-10-24", "", "", "Corona", "", 30],
    ],
    Hoja1: [["DNI"], ["000"]],
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0]?.slotIndex, 2);
  assert.equal(parsed.rows[1]?.resourceId, null);
  assert.equal(JSON.stringify(parsed).includes("Q1") && parsed.rows[1]?.resourceId === null, true);
  const plan = planMasterImport({ existing: [], identities: [], incoming: parsed.rows });
  assert.equal(plan.rowsToInsert.length, 2);
  assert.equal(plan.batchStatus, "REVIEW");
  assert.equal(plan.identityCreates.length, 2);
  const corona = plan.rowsToInsert.find((row) => row.historyNumber === "HC2");
  assert.equal(corona?.shift, null);
  assert.ok(corona?.flags.includes("TURNO_INFERIDO"));
  assert.equal(corona?.suggestedShift, "morning");
});

test("a DNI column rejects the file and a shorter second file is FUENTE_INCOMPLETA without deleting", () => {
  const rejected = parseMasterWorkbook(workbook({
    DATOS_IQ: [["Historia", "Nombre", "Procedimiento", "Fecha", "DNI"], ["HC9", "Ana", "IQ", "2031-10-24", "12345678Z"]],
  }));
  assert.deepEqual(rejected, { ok: false, error: "dni_column" });
  assert.equal(JSON.stringify(rejected).includes("12345678Z"), false);

  const second = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [HEADERS, ["HC1", "Ana López", "Artroscopia", "2031-10-24", "mañana", "Q1", "Muel", "08:00", 40]],
  }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const plan = planMasterImport({
    existing: [
      { dedupKey: "hc1|2031-10-24|artroscopia", historyNumber: "HC1", patientName: "Ana López", serviceDate: "2031-10-24" },
      { dedupKey: "hc2|2031-10-24|hernia", historyNumber: "HC2", patientName: "Luis Corona", serviceDate: "2031-10-24" },
    ],
    identities: [],
    incoming: second.rows,
  });
  assert.equal(plan.batchStatus, "FUENTE_INCOMPLETA");
  assert.deepEqual(plan.missingKeys, ["hc2|2031-10-24|hernia"]);
  assert.equal(plan.rowsToInsert.length, 0);
  assert.equal("delete" in plan, false);
});

test("a different name for the same history is NOMBRE_DIVERGENTE and is not merged or approvable", () => {
  const parsed = parseMasterWorkbook(workbook({
    "1_PROGRAMA": [HEADERS, ["HC1", "Ana María López", "Colecistectomía", "2031-10-24", "tarde", "Q2", "Blanco", "15:00", 50]],
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const plan = planMasterImport({
    existing: [],
    identities: [{ historyNumber: "HC1", displayName: "Ana López" }],
    incoming: parsed.rows,
  });
  assert.equal(plan.identityCreates.length, 0);
  assert.equal(plan.rowsToInsert[0]?.status, "NOMBRE_DIVERGENTE");
  assert.equal(canApproveIntakeRow({
    status: "NOMBRE_DIVERGENTE",
    flags: "NOMBRE_DIVERGENTE",
    shift: "afternoon",
    resourceId: "Q2",
    slotIndex: 0,
    surgeonName: "Blanco",
  }), false);
  assert.equal(canApproveIntakeRow({
    status: "PENDING",
    flags: "",
    shift: "morning",
    resourceId: "Q1",
    slotIndex: 2,
    surgeonName: "Muel",
  }), true);
  assert.equal(matchSurgeon("Iglesias", [
    { id: "a", name: "Iglesias Alonso" },
    { id: "b", name: "Iglesias Montero" },
  ]).ok, false);
});

test("week export uses 1_PROGRAMA and 5_CAMBIOS and omits phone email and dni", () => {
  const bytes = buildWeekWorkbook({
    program: [{
      date: "2031-10-24",
      shift: "morning",
      slotIndex: 2,
      resourceId: "Q1",
      surgeonName: "Muel",
      historyNumber: "HC1",
      patientName: "Ana María López",
      procedure: "artroscopia",
      minutes: 40,
    }],
    changes: [{
      createdAt: "2031-10-20T09:00:00.000Z",
      changeType: "SUSPENSION",
      reasonCode: "SIN_SEGURO",
      beforeJson: "{\"workflowStatus\":\"ACTIVE\"}",
      afterJson: "{\"workflowStatus\":\"SUSPENDED\"}",
    }],
  });
  const book = XLSX.read(bytes, { type: "buffer" });
  assert.deepEqual(book.SheetNames, ["1_PROGRAMA", "5_CAMBIOS"]);
  const text = JSON.stringify(book);
  assert.equal(text.includes("600111222"), false);
  assert.equal(/phone|email|correo|dni/i.test(text), false);
  assert.match(text, /A\.M\.L\./);
  const exportRoute = readFileSync("src/app/api/intake/week-export/route.ts", "utf8");
  const importRoute = readFileSync("src/app/api/intake/import/route.ts", "utf8");
  const approveRoute = readFileSync("src/app/api/intake/rows/[id]/approve/route.ts", "utf8");
  assert.equal(exportRoute.includes("patientPhone"), false);
  assert.equal(importRoute.includes("createReservationInDb"), false);
  assert.equal(importRoute.includes("sendEmail"), false);
  assert.match(approveRoute, /createReservationInDb/);
  assert.equal(approveRoute.includes("sendEmail"), false);
  assert.match(readFileSync(".gitignore", "utf8"), /\/prisma\/\*\.db/);
});
