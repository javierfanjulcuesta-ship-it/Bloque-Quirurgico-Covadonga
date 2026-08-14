import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

test("SheetJS can round-trip a minimal workbook used by planning import", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Quirófano", "Procedimiento"],
    ["2026-08-14", "Q1", "Procedimiento de prueba"],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Planificación");

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const parsed = XLSX.read(bytes, { type: "buffer" });
  const parsedSheet = parsed.Sheets[parsed.SheetNames[0]];

  assert.ok(parsedSheet);
  assert.deepEqual(XLSX.utils.sheet_to_json(parsedSheet, { header: 1 }), [
    ["Fecha", "Quirófano", "Procedimiento"],
    ["2026-08-14", "Q1", "Procedimiento de prueba"],
  ]);
});
