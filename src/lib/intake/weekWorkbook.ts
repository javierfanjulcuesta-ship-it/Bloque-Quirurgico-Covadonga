import * as XLSX from "xlsx";
import { getSlots } from "@/lib/utils";
import { patientInitials } from "@/lib/drafts/parteTemplate";

export interface WeekProgramRow {
  date: string;
  shift: "morning" | "afternoon";
  slotIndex: number;
  resourceId: string;
  surgeonName: string;
  historyNumber: string;
  patientName: string | null;
  procedure: string;
  minutes: number;
}

export interface WeekChangeRow {
  createdAt: string;
  changeType: string;
  reasonCode: string | null;
  beforeJson: string;
  afterJson: string;
}

function clock(shift: "morning" | "afternoon", slotIndex: number): string {
  return getSlots(shift)[slotIndex]?.start ?? "";
}

export function buildWeekWorkbook(input: { program: WeekProgramRow[]; changes: WeekChangeRow[] }): Buffer {
  const program = input.program.map((row) => ({
    fecha: row.date,
    turno: row.shift === "afternoon" ? "TARDE" : "MAÑANA",
    hora: clock(row.shift, row.slotIndex),
    quirofano: row.resourceId,
    cirujano: row.surgeonName,
    historia: row.historyNumber,
    iniciales: patientInitials(row.patientName),
    procedimiento: row.procedure,
    minutos: row.minutes,
  }));
  const changes = input.changes.map((row) => ({
    fecha: row.createdAt.slice(0, 10),
    tipo: row.changeType,
    motivo: row.reasonCode ?? "",
    antes: row.beforeJson,
    despues: row.afterJson,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(program), "1_PROGRAMA");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(changes), "5_CAMBIOS");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
