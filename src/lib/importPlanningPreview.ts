import * as XLSX from "xlsx";
import { RESOURCES } from "@/lib/constants";
import type { ResourceId } from "@/lib/types";

const WEEKDAY_MAP: Array<{ key: string; canonical: string }> = [
  { key: "lunes", canonical: "lunes" },
  { key: "martes", canonical: "martes" },
  { key: "miercoles", canonical: "miércoles" },
  { key: "miércoles", canonical: "miércoles" },
  { key: "jueves", canonical: "jueves" },
  { key: "viernes", canonical: "viernes" },
];

export interface PlanningPreviewBlock {
  id: string;
  source: "excel" | "pdf";
  /** Estado de revisión local (fase 2): valid | review | ignored */
  reviewStatus: "valid" | "review" | "ignored";
  /** Marca si el parser detectó ambigüedad inicial en el bloque. */
  hasIssue: boolean;
  day: string;
  shift: "morning" | "afternoon" | "unknown";
  resourceId: ResourceId | "unknown";
  resourceLabel: string;
  /** Texto original detectado (trazabilidad). */
  rawText: string;
  /** Valores detectados automáticos (trazabilidad). */
  detectedSurgeon?: string;
  detectedFunding?: "SESPA" | "Privado" | "Mutua" | "Mixto" | "Desconocido";
  /** Correcciones manuales (si existen) */
  correctedDay?: string;
  correctedShift?: "morning" | "afternoon" | "unknown";
  correctedResourceId?: ResourceId | "unknown";
  correctedSurgeon?: string;
  correctedFunding?: "SESPA" | "Privado" | "Mutua" | "Mixto" | "Desconocido";
  correctedText?: string;
}

export interface PlanningPreviewResult {
  blocks: PlanningPreviewBlock[];
  issues: string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectWeekday(text: string): string | undefined {
  const t = normalize(text);
  return WEEKDAY_MAP.find((d) => t.includes(d.key))?.canonical;
}

function detectShift(text: string): "morning" | "afternoon" | "unknown" {
  const t = normalize(text);
  if (t.includes("manana") || t.includes("mañana") || t.includes("am")) return "morning";
  if (t.includes("tarde") || t.includes("pm")) return "afternoon";
  return "unknown";
}

function detectResource(text: string): { id: ResourceId | "unknown"; label: string } {
  const t = normalize(text);
  if (/\bq\s*1\b|\bquirofano\s*1\b/.test(t)) return { id: "Q1", label: "Q1" };
  if (/\bq\s*2\b|\bquirofano\s*2\b/.test(t)) return { id: "Q2", label: "Q2" };
  if (/\bq\s*3\b|\bquirofano\s*3\b/.test(t)) return { id: "Q3", label: "Q3" };
  if (t.includes("endoscop")) return { id: "procedimientos-menores", label: "Endoscopia (mapeado a Procedimientos menores)" };
  if (t.includes("proced")) return { id: "procedimientos-menores", label: "Procedimientos menores" };
  if (t.includes("dolor")) return { id: "tecnicas-dolor", label: "Técnicas del dolor" };
  return { id: "unknown", label: "Sin recurso identificado" };
}

function detectFunding(text: string): "SESPA" | "Privado" | "Mutua" | "Mixto" | "Desconocido" {
  const t = normalize(text);
  const sespa = /\bsespa\b|\bsergas\b|\bsas\b|\bpublic/.test(t);
  const privado = /\bprivad/.test(t);
  const mutua = /\bmutua\b|\bmutual\b|\bfremap\b|\bmapfre\b|\badeslas\b|\basisa\b|\bdkv\b|\baxa\b/.test(t);
  const count = [sespa, privado, mutua].filter(Boolean).length;
  if (count > 1) return "Mixto";
  if (sespa) return "SESPA";
  if (privado) return "Privado";
  if (mutua) return "Mutua";
  return "Desconocido";
}

function detectSurgeon(text: string, surgeons: Array<{ id: string; name: string }>): string | undefined {
  const t = normalize(text);
  for (const s of surgeons) {
    const name = normalize(s.name);
    const surname = name.split(" ").filter(Boolean).at(-1) ?? name;
    if (t.includes(name) || (surname.length > 3 && t.includes(surname))) return s.name;
  }
  return undefined;
}

function parseExcel(arrayBuffer: ArrayBuffer, surgeons: Array<{ id: string; name: string }>): PlanningPreviewResult {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const issues: string[] = [];
  const blocks: PlanningPreviewBlock[] = [];
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { blocks, issues: ["El archivo Excel no contiene hojas."] };
  const ws = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: false, defval: "" });
  if (!rows.length) return { blocks, issues: ["La hoja de Excel está vacía."] };

  const colHints = new Map<number, { day?: string; resource?: { id: ResourceId | "unknown"; label: string } }>();
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const row = rows[r] ?? [];
    row.forEach((cell, c) => {
      const text = String(cell ?? "").trim();
      if (!text) return;
      const day = detectWeekday(text);
      const resource = detectResource(text);
      const prev = colHints.get(c) ?? {};
      colHints.set(c, {
        day: day ?? prev.day,
        resource: resource.id !== "unknown" ? resource : prev.resource,
      });
    });
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rowText = row.map((x) => String(x ?? "")).join(" ");
    const rowShift = detectShift(rowText);
    row.forEach((cell, c) => {
      const raw = String(cell ?? "").trim();
      if (!raw || raw.length < 3) return;
      if (detectWeekday(raw) || detectResource(raw).id !== "unknown") return;
      const hint = colHints.get(c);
      const day = hint?.day ?? "día no identificado";
      const resource = hint?.resource ?? { id: "unknown", label: "Sin recurso identificado" };
      const funding = detectFunding(raw);
      const surgeon = detectSurgeon(raw, surgeons);
      const hasIssue = !hint?.day || resource.id === "unknown" || funding === "Desconocido" || !surgeon;
      blocks.push({
        id: `excel-${r}-${c}`,
        source: "excel",
        reviewStatus: hasIssue ? "review" : "valid",
        hasIssue,
        day,
        shift: rowShift,
        resourceId: resource.id,
        resourceLabel: resource.label,
        rawText: raw,
        detectedSurgeon: surgeon,
        detectedFunding: funding,
      });
      if (!hint?.day) issues.push(`Fila ${r + 1}, columna ${c + 1}: día no detectado automáticamente.`);
      if (resource.id === "unknown") issues.push(`Fila ${r + 1}, columna ${c + 1}: recurso no detectado.`);
    });
  }

  return { blocks, issues };
}

async function parsePdf(arrayBuffer: ArrayBuffer, surgeons: Array<{ id: string; name: string }>): Promise<PlanningPreviewResult> {
  const { getDocument } = await import("pdfjs-dist");
  const issues: string[] = [];
  const blocks: PlanningPreviewBlock[] = [];
  const data = new Uint8Array(arrayBuffer);
  const doc = await (getDocument as unknown as (params: { data: Uint8Array; disableWorker: boolean }) => { promise: Promise<any> })({
    data,
    disableWorker: true,
  }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const lines = textContent.items
      .map((i: { str?: unknown }) => (typeof i.str === "string" ? i.str : ""))
      .join("\n")
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    lines.forEach((line: string, idx: number) => {
      if (line.length < 6) return;
      const day = detectWeekday(line) ?? "día no identificado";
      const shift = detectShift(line);
      const resource = detectResource(line);
      const funding = detectFunding(line);
      const surgeon = detectSurgeon(line, surgeons);
      const hasIssue = day === "día no identificado" || resource.id === "unknown" || funding === "Desconocido" || !surgeon;
      blocks.push({
        id: `pdf-${p}-${idx}`,
        source: "pdf",
        reviewStatus: hasIssue ? "review" : "valid",
        hasIssue,
        day,
        shift,
        resourceId: resource.id,
        resourceLabel: resource.label,
        rawText: line,
        detectedSurgeon: surgeon,
        detectedFunding: funding,
      });
      if (day === "día no identificado") issues.push(`PDF página ${p}, línea ${idx + 1}: no se detecta día.`);
    });
  }
  if (!blocks.length) issues.push("No se detectaron líneas útiles en el PDF.");
  return { blocks, issues };
}

export async function parsePlanningFilePreview(
  file: File,
  surgeons: Array<{ id: string; name: string }>
): Promise<PlanningPreviewResult> {
  const ext = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
    return parseExcel(buffer, surgeons);
  }
  if (ext.endsWith(".pdf")) {
    return parsePdf(buffer, surgeons);
  }
  return { blocks: [], issues: ["Formato no soportado. Use .xlsx, .xls o .pdf."] };
}

export function supportedPlanningResources() {
  return RESOURCES;
}

