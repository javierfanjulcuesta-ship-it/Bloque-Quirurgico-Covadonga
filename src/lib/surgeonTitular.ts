/**
 * Cirujano titular (frontend): unifica la lectura de `surgeonId` (usuario interno obligatorio en API)
 * y el nombre externo opcional guardado en el prefijo de notas del primer paciente.
 */

// FUTURO: esto migrará a entidad Surgeon (interno/externo unificado)

import type { Reservation } from "@/lib/types";

function normalizeForCompare(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Prefijos escritos por `ProgramarPacientesModal` al guardar (y variantes legacy). */
const EXTERNAL_TITULAR_PREFIX = /^\[Cirujano titular \(texto libre\):\s*([^\]]*?)\]\s*/i;
const LEGACY_TITULAR_REF_PREFIX = /^\[Titular ref\.:\s*([^\]]*?)\]\s*/i;

/** Extrae el nombre libre del titular desde las notas del paciente (si existe). */
export function parseExternalTitularFromPatientNotes(notes: string | undefined): string | undefined {
  const n = (notes ?? "").trim();
  if (!n) return undefined;
  const m = n.match(EXTERNAL_TITULAR_PREFIX) ?? n.match(LEGACY_TITULAR_REF_PREFIX);
  const raw = m?.[1]?.trim();
  return raw || undefined;
}

export type TitularSurgeonKind = "internal" | "external";

export interface ResolveTitularSurgeonResult {
  kind: TitularSurgeonKind;
  /** Nombre único a mostrar como “cirujano titular” (prioriza interno si existe). */
  displayName: string;
  internalSurgeonId?: string;
  /** Si `kind === "internal"` y el texto libre en notas difiere del nombre interno. */
  externalNoteReference?: string;
}

/**
 * Resuelve el titular a partir de una reserva y el directorio de usuarios.
 * - Con `surgeonId` válido en directorio → interno; si las notas traen otro nombre, va en `externalNoteReference`.
 * - Sin usuario en directorio pero con prefijo en notas → externo.
 */
export function resolveTitularSurgeon(
  reservation: Pick<Reservation, "surgeonId" | "patients">,
  users: ReadonlyArray<{ id: string; name: string }>
): ResolveTitularSurgeonResult {
  const externalFromNotes = parseExternalTitularFromPatientNotes(reservation.patients?.[0]?.notes);
  const sid = reservation.surgeonId;

  if (sid === "[otro]") {
    if (externalFromNotes) {
      return { kind: "external", displayName: externalFromNotes };
    }
    return { kind: "internal", displayName: "Otro cirujano", internalSurgeonId: sid };
  }

  const user = users.find((u) => u.id === sid);
  const internalName = user?.name?.trim();

  if (internalName) {
    const extDiff =
      externalFromNotes && normalizeForCompare(externalFromNotes) !== normalizeForCompare(internalName)
        ? externalFromNotes
        : undefined;
    return {
      kind: "internal",
      displayName: internalName,
      internalSurgeonId: sid,
      externalNoteReference: extDiff,
    };
  }

  if (externalFromNotes) {
    return { kind: "external", displayName: externalFromNotes };
  }

  return { kind: "internal", displayName: sid, internalSurgeonId: sid };
}

/** Nombre corto del titular para tablas y cabeceras (p. ej. Cuadro de Mando, listados). */
export function getDisplaySurgeonName(
  reservation: Pick<Reservation, "surgeonId" | "patients">,
  users: ReadonlyArray<{ id: string; name: string }>
): string {
  return resolveTitularSurgeon(reservation, users).displayName;
}

export interface ResolveTitularSchedulerFormParams {
  responsibleSurgeonId: string;
  externalSurgeonDisplayName: string;
  surgeonCandidates: ReadonlyArray<{ id: string; name: string }>;
  /** Si true, el interno es obligatorio antes de guardar (gestor). */
  requireInternalUser: boolean;
  /** Nombre del usuario en sesión cuando el hueco es suyo (cirujano / no gestor). */
  schedulerSelfDisplayName?: string;
}

/** Estado del modal de programación antes de persistir (mismas reglas de prioridad que la reserva guardada). */
export function resolveTitularSchedulerForm(
  params: ResolveTitularSchedulerFormParams
): ResolveTitularSurgeonResult & { state: "empty" | "external_only" | "internal" } {
  const ext = params.externalSurgeonDisplayName.trim();
  const intId = params.responsibleSurgeonId.trim();
  const intName = intId ? params.surgeonCandidates.find((u) => u.id === intId)?.name?.trim() ?? "" : "";
  const self = params.schedulerSelfDisplayName?.trim() ?? "";

  if (params.requireInternalUser) {
    if (intName) {
      const extDiff = ext && normalizeForCompare(ext) !== normalizeForCompare(intName) ? ext : undefined;
      return {
        kind: "internal",
        displayName: intName,
        internalSurgeonId: intId,
        externalNoteReference: extDiff,
        state: "internal",
      };
    }
    if (ext) {
      return { kind: "external", displayName: ext, state: "external_only" };
    }
    return { kind: "internal", displayName: "—", state: "empty" };
  }

  if (self) {
    const extDiff = ext && normalizeForCompare(ext) !== normalizeForCompare(self) ? ext : undefined;
    return {
      kind: "internal",
      displayName: self,
      externalNoteReference: extDiff,
      state: "internal",
    };
  }

  if (ext) {
    return { kind: "external", displayName: ext, state: "external_only" };
  }
  return { kind: "internal", displayName: "—", state: "empty" };
}
