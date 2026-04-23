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
  /** Corrección manual del span (número de slots del bloque importado). */
  correctedSlotSpan?: number;
}

export interface PlanningPreviewResult {
  blocks: PlanningPreviewBlock[];
  issues: string[];
}

interface PdfLine {
  text: string;
  y: number;
}

let pdfWorkerConfigured = false;

function configurePdfWorker(pdfjsLib: { GlobalWorkerOptions?: { workerSrc: string }; version?: string }) {
  if (pdfWorkerConfigured) return;
  if (typeof window === "undefined") return;
  if (!pdfjsLib.GlobalWorkerOptions) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  console.log("PDF worker:", pdfjsLib.GlobalWorkerOptions.workerSrc);
  pdfWorkerConfigured = true;
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
  const issues: string[] = [];
  const blocks: PlanningPreviewBlock[] = [];
  let totalLines = 0;
  let ignoredLines = 0;
  let doc: { numPages: number; getPage: (n: number) => Promise<any> } | null = null;

  const NOISE_PATTERNS: RegExp[] = [
    /^\d+\s*\/\s*\d+$/,
    /^pagina\s+\d+/i,
    /^planificacion/i,
    /^semana/i,
    /^bloque/i,
    /^quir[oó]fano/i,
    /^turno/i,
    /^recurso/i,
    /^observaciones?:?$/i,
  ];

  function isNoiseLine(line: string): boolean {
    const compact = line.trim();
    if (!compact) return true;
    if (compact.length < 4) return true;
    if (/^[\W_]+$/.test(compact)) return true;
    return NOISE_PATTERNS.some((p) => p.test(compact));
  }

  function buildLinesFromTextItems(items: Array<{ str?: unknown; transform?: unknown }>): PdfLine[] {
    const positioned = items
      .map((item) => {
        const text = typeof item.str === "string" ? item.str.trim() : "";
        const transform = Array.isArray(item.transform) ? item.transform : [];
        const x = typeof transform[4] === "number" ? transform[4] : 0;
        const y = typeof transform[5] === "number" ? transform[5] : 0;
        return { text, x, y };
      })
      .filter((t) => t.text.length > 0);

    if (!positioned.length) return [];

    const yTolerance = 3;
    const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const item of positioned) {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
      if (row) {
        row.items.push({ x: item.x, text: item.text });
      } else {
        rows.push({ y: item.y, items: [{ x: item.x, text: item.text }] });
      }
    }

    const columnGapThreshold = 120;
    const splitByColumns = (sortedItems: Array<{ x: number; text: string }>): string[] => {
      if (!sortedItems.length) return [];
      const segments: string[] = [];
      let currentSegment: string[] = [sortedItems[0]!.text];
      let prevX = sortedItems[0]!.x;
      for (let i = 1; i < sortedItems.length; i++) {
        const item = sortedItems[i]!;
        const gap = item.x - prevX;
        if (gap > columnGapThreshold) {
          segments.push(currentSegment.join(" ").replace(/\s+/g, " ").trim());
          currentSegment = [item.text];
        } else {
          currentSegment.push(item.text);
        }
        prevX = item.x;
      }
      segments.push(currentSegment.join(" ").replace(/\s+/g, " ").trim());
      return segments.filter((s) => s.length > 0);
    };

    return rows
      .sort((a, b) => b.y - a.y)
      .flatMap((row) => {
        const sorted = row.items.sort((a, b) => a.x - b.x);
        const segments = splitByColumns(sorted);
        return segments.map((segment) => ({ text: segment, y: row.y }));
      })
      .filter((l) => l.text.length > 0);
  }

  try {
    const pdfjsLib = await import("pdfjs-dist");
    configurePdfWorker(pdfjsLib as unknown as { GlobalWorkerOptions?: { workerSrc: string }; version?: string });
    const { getDocument } = pdfjsLib;
    const data = new Uint8Array(arrayBuffer);
    doc = await (getDocument as unknown as (params: { data: Uint8Array }) => { promise: Promise<any> })({
      data,
    }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes("worker")) {
      issues.push(`No se pudo procesar el PDF (worker local): ${msg}`);
    } else {
      issues.push(`No se pudo procesar el PDF (archivo o formato): ${msg}`);
    }
    return { blocks: [], issues };
  }

  if (!doc) {
    issues.push("No se pudo procesar el PDF.");
    return { blocks: [], issues };
  }

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const textContent = await page.getTextContent();
    const lines = buildLinesFromTextItems(textContent.items as Array<{ str?: unknown; transform?: unknown }>);
    totalLines += lines.length;

    let currentDay: string | undefined;
    let currentShift: "morning" | "afternoon" | "unknown" = "unknown";
    let currentResource: { id: ResourceId | "unknown"; label: string } = { id: "unknown", label: "Sin recurso identificado" };

    lines.forEach((lineObj, idx: number) => {
      const line = lineObj.text;
      if (line.length < 6) return;

      if (isNoiseLine(line)) {
        ignoredLines += 1;
        return;
      }

      const detectedDay = detectWeekday(line);
      if (detectedDay) currentDay = detectedDay;
      const detectedShift = detectShift(line);
      if (detectedShift !== "unknown") currentShift = detectedShift;
      const detectedResource = detectResource(line);
      if (detectedResource.id !== "unknown") currentResource = detectedResource;

      const day = detectedDay ?? currentDay ?? "día no identificado";
      const shift = detectedShift !== "unknown" ? detectedShift : currentShift;
      const resource = detectedResource.id !== "unknown" ? detectedResource : currentResource;
      const funding = detectFunding(line);
      const surgeon = detectSurgeon(line, surgeons);

      const looksLikeContextOnly =
        (detectedDay !== undefined || detectedShift !== "unknown" || detectedResource.id !== "unknown") &&
        !surgeon &&
        funding === "Desconocido";
      if (looksLikeContextOnly) {
        ignoredLines += 1;
        return;
      }

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
  issues.unshift(`Calidad parseo PDF: líneas=${totalLines}, ignoradas=${ignoredLines}, bloques=${blocks.length}, incidencias=${issues.length}`);
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

