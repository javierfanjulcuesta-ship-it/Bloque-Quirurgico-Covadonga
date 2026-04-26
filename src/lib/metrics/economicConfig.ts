/**
 * Configuración económica simulada (cliente).
 * Valores por defecto = antiguas constantes de economicModel.
 * Carga opcional desde Excel (hoja "configuracion", columnas clave | valor).
 */

import * as XLSX from "xlsx";

export interface EconomicConfig {
  ingresoPorMinutoDefault: number;
  ingresoPorMinutoPrivado: number;
  ingresoPorMinutoSespa: number;
  costeQuirofanoPorMinuto: number;
  costePersonalPorMinuto: number;
  costeVariablePorPaciente: number;
  umbralMargenAjustado: number;
  costeAperturaTurnoDefault: number;
  umbralRentable: number;
  umbralNoRentable: number;
  umbralMinutosRentableMapa: number;
}

export const DEFAULT_ECONOMIC_CONFIG: EconomicConfig = {
  ingresoPorMinutoDefault: 18,
  ingresoPorMinutoPrivado: 30,
  ingresoPorMinutoSespa: 12,
  costeQuirofanoPorMinuto: 8,
  costePersonalPorMinuto: 6,
  costeVariablePorPaciente: 120,
  umbralMargenAjustado: 300,
  costeAperturaTurnoDefault: 1000,
  umbralRentable: 300,
  umbralNoRentable: -200,
  umbralMinutosRentableMapa: 120,
};

/** Clave Excel (columna "clave") → campo de EconomicConfig. */
const EXCEL_KEY_TO_FIELD: Record<string, keyof EconomicConfig> = {
  coste_turno_base: "costeAperturaTurnoDefault",
  ingreso_min_privado: "ingresoPorMinutoPrivado",
  ingreso_min_sespa: "ingresoPorMinutoSespa",
  ingreso_min_default: "ingresoPorMinutoDefault",
  coste_variable_paciente: "costeVariablePorPaciente",
  umbral_minutos_rentable: "umbralMinutosRentableMapa",
  coste_quirofano_minuto: "costeQuirofanoPorMinuto",
  coste_personal_minuto: "costePersonalPorMinuto",
  umbral_margen_marginal_ajustado: "umbralMargenAjustado",
  umbral_margen_mapa_rentable: "umbralRentable",
  umbral_margen_mapa_no_rentable: "umbralNoRentable",
};

export const REQUIRED_ECONOMIC_EXCEL_KEYS = Object.keys(EXCEL_KEY_TO_FIELD) as (keyof typeof EXCEL_KEY_TO_FIELD)[];

function normalizeExcelKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

function parseNumericCell(val: unknown): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s = String(val).trim().replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export type ParseEconomicConfigResult =
  | { ok: true; config: EconomicConfig }
  | { ok: false; error: string };

/**
 * Lee un .xlsx con hoja "configuracion" y filas clave | valor.
 */
export function parseEconomicConfigFromXlsx(buffer: ArrayBuffer): ParseEconomicConfigResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { ok: false, error: "No se pudo leer el archivo Excel." };
  }

  const sheetName = wb.SheetNames.find((n) => normalizeExcelKey(n) === "configuracion");
  if (!sheetName) {
    return { ok: false, error: 'Falta la hoja "configuracion" (también válido: configuración).' };
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { ok: false, error: "La hoja configuracion está vacía." };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) {
    return { ok: false, error: "La hoja no tiene filas de datos." };
  }

  const first = rows[0]!;
  const keysLower = Object.keys(first).map((k) => k.trim().toLowerCase());
  const claveCol = Object.keys(first).find((k) => normalizeExcelKey(k) === "clave");
  const valorCol = Object.keys(first).find((k) => normalizeExcelKey(k) === "valor");
  if (!claveCol || !valorCol) {
    return { ok: false, error: 'Las columnas deben llamarse "clave" y "valor" (primera fila = cabeceras).' };
  }

  const merged: EconomicConfig = { ...DEFAULT_ECONOMIC_CONFIG };
  const seen = new Set<string>();

  for (const row of rows) {
    const claveRaw = row[claveCol];
    const valorRaw = row[valorCol];
    if (claveRaw == null || String(claveRaw).trim() === "") continue;
    const nk = normalizeExcelKey(String(claveRaw));
    const field = EXCEL_KEY_TO_FIELD[nk];
    if (!field) continue;
    const num = parseNumericCell(valorRaw);
    if (num === null) {
      return { ok: false, error: `Valor no numérico para la clave "${claveRaw}".` };
    }
    merged[field] = num;
    seen.add(nk);
  }

  for (const req of REQUIRED_ECONOMIC_EXCEL_KEYS) {
    if (!seen.has(req)) {
      return { ok: false, error: `Falta la clave obligatoria: ${req}` };
    }
  }

  return { ok: true, config: merged };
}

export function economicConfigsEqual(a: EconomicConfig, b: EconomicConfig): boolean {
  return (Object.keys(a) as (keyof EconomicConfig)[]).every((k) => a[k] === b[k]);
}
