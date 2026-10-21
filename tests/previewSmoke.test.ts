import assert from "node:assert/strict";
import test from "node:test";
import { outboundDraftExpiresAt } from "../src/lib/drafts/draftExpiry";
import { renderParte } from "../src/lib/drafts/parteTemplate";
import { reviewMasterImport } from "../src/lib/intake/masterWorkbook";
import { buildPrintableWeek } from "../src/lib/program/printableWeek";

test("fictional master review, alerts, tray text and printable week stay in memory", () => {
  const reviewed = reviewMasterImport({
    salt: "sal-de-prueba-con-24-caracteres",
    existing: [],
    incoming: [
      {
        sheetName: "1_PROGRAMA",
        historyNumber: "TEST-0001",
        patientName: "Paciente Prueba 01",
        procedure: "Procedimiento de prueba",
        serviceDate: "2031-10-20",
        shift: "morning",
        resourceId: "Q1",
        slotIndex: 0,
        surgeonName: "Cirujano Demo",
        minutes: 45,
        flags: [],
        suggestedShift: null,
        suggestedResourceId: null,
      },
      {
        sheetName: "DATOS_IQ",
        historyNumber: "TEST-0002",
        patientName: "Paciente Prueba 02",
        procedure: "Segundo procedimiento",
        serviceDate: "2031-10-20",
        shift: "morning",
        resourceId: "Q1",
        slotIndex: 1,
        surgeonName: "Endoscopista Demo",
        minutes: 80,
        flags: [],
        suggestedShift: null,
        suggestedResourceId: null,
      },
    ],
  });

  const published = JSON.stringify(reviewed.publicRows);
  assert.equal(published.includes("TEST-0001"), false);
  assert.equal(published.includes("Paciente Prueba"), false);
  assert.equal(reviewed.publicRows.length, 2);
  assert.ok(Array.isArray(reviewed.alerts));
  assert.equal(reviewed.parte.includes("Paciente Prueba"), false);
  assert.match(reviewed.parte, /P\.P\.0\./);

  const tray = {
    status: "PENDING_APPROVAL",
    subject: "Parte quirúrgico",
    bodyText: renderParte([
      {
        date: "2031-10-20",
        shift: "morning",
        slotIndex: 0,
        fullName: "Paciente Prueba 01",
        procedure: "Procedimiento de prueba",
      },
    ]).body,
    expiresAt: outboundDraftExpiresAt(new Date("2031-10-20T08:00:00.000Z")).toISOString(),
  };
  assert.equal(tray.status, "PENDING_APPROVAL");
  assert.equal(tray.bodyText.includes("Paciente Prueba"), false);
  assert.equal(tray.expiresAt, "2031-10-27T08:00:00.000Z");

  const rows = buildPrintableWeek({
    from: "2031-10-20",
    to: "2031-10-24",
    users: [{ id: "cirujano-demo", name: "Cirujano Demo" }],
    assignments: [],
    reservations: [
      {
        id: "reserva-humo",
        date: "2031-10-20",
        shift: "morning",
        slotIndex: 0,
        resourceId: "Q1",
        surgeonId: "cirujano-demo",
        status: "confirmed",
        patients: [{ caseLabel: "Caso 1", procedure: "Procedimiento de prueba", order: 0 }],
      },
    ],
  });
  assert.equal(rows[0]?.caseLabel, "Caso 1");
  assert.equal(JSON.stringify(rows).includes("TEST-0001"), false);
  assert.equal(JSON.stringify(rows).includes("Paciente Prueba"), false);
});
