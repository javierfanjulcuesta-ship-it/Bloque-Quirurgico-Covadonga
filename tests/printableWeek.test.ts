import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPrintableWeek, type PrintableReservation } from "../src/lib/program/printableWeek";

const users = [
  { id: "cirujano-demo", name: "Cirujano Demo" },
  { id: "anestesista-q1", name: "Anestesista Demo" },
  { id: "anestesista-endo", name: "Endoscopista Demo" },
  { id: "anestesista-turno", name: "Gestor Anestesista Demo" },
];

function reservation(overrides: Partial<PrintableReservation> = {}): PrintableReservation {
  return {
    id: "reserva-1",
    date: "2026-10-19",
    shift: "morning",
    slotIndex: 0,
    resourceId: "Q1",
    surgeonId: "cirujano-demo",
    status: "confirmed",
    patients: [
      {
        name: "Paciente Prueba 01",
        procedure: "Procedimiento de prueba",
        order: 1,
        notes: "historia TEST-0001 contacto CONTACTO-FICTICIO CORREO-FICTICIO",
      },
    ],
    ...overrides,
  };
}

test("the printable week shows initials, ENDO and the room anesthetist", () => {
  const rows = buildPrintableWeek({
    from: "2026-10-19",
    to: "2026-10-23",
    users,
    assignments: [
      { date: "2026-10-19", shift: "morning", assignmentType: "OR", resourceId: "Q1", anesthetistId: "anestesista-q1" },
      { date: "2026-10-19", shift: "morning", assignmentType: "OR", resourceId: "endoscopias", anesthetistId: "anestesista-endo" },
      { date: "2026-10-19", shift: "morning", assignmentType: "OR", resourceId: "__full_shift__", anesthetistId: "anestesista-turno" },
    ],
    reservations: [
      reservation(),
      reservation({
        id: "reserva-endo",
        resourceId: "ENDO",
        slotIndex: 1,
        patients: [{ name: "Paciente Prueba 02", procedure: "Exploración de prueba", order: 0 }],
      }),
      reservation({
        id: "fuera",
        date: "2026-10-26",
      }),
      reservation({
        id: "cancelada",
        status: "cancelled",
        patients: [{ name: "Paciente Prueba 03", procedure: "No debe salir" }],
      }),
      reservation({
        id: "tarde",
        shift: "afternoon",
        slotIndex: 0,
        resourceId: "Q2",
        patients: [
          { name: "Paciente Prueba 04", procedure: "Segundo", order: 2, scheduleStatus: "CANCELLED" },
          { name: "Paciente Prueba 05", procedure: "Primero", order: 0 },
        ],
      }),
    ],
  });

  assert.deepEqual(rows.map((row) => `${row.resourceId} ${row.time} ${row.initials} ${row.anesthetist}`), [
    "Q1 08:00 P.P.0. Anestesista Demo",
    "ENDO 09:30 P.P.0. Endoscopista Demo",
    "Q2 15:00 P.P.0. ",
  ]);
  assert.equal(rows[1]?.resourceLabel, "Endoscopias");
  assert.equal(rows[1]?.shiftLabel, "MAÑANA");
  assert.equal(rows[2]?.day, "lunes 19/10");
  assert.equal(rows[2]?.shiftLabel, "TARDE");
  assert.equal(rows[2]?.procedure, "Primero");
  assert.equal(rows[2]?.surgeon, "Cirujano Demo");

  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes("TEST-0001"), false);
  assert.equal(serialized.includes("Paciente Prueba"), false);
  assert.equal(serialized.includes("CONTACTO-FICTICIO"), false);
  assert.equal(serialized.includes("CORREO-FICTICIO"), false);
  assert.equal(Object.keys(rows[0] ?? {}).includes("historyNumber"), false);
});

test("the print view does not persist the sheet", () => {
  const source = readFileSync("src/components/gestor/SemanaImprimir.tsx", "utf8");
  assert.match(source, /window\.print/);
  assert.match(source, /buildPrintableWeek/);
  assert.equal(/localStorage\.setItem|prisma\.|historyNumber|patientPhone|patientEmail/.test(source), false);
});
