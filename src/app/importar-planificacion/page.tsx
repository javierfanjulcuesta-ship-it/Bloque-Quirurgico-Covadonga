"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/context/UsersContext";
import { hasGestorAccess, roleLabel } from "@/lib/types";
import { RESOURCES } from "@/lib/constants";
import type { ResourceId, Shift, SlotView } from "@/lib/types";
import { PageShellHeader } from "@/components/ui/PageShellHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import { parsePlanningFilePreview, type PlanningPreviewBlock } from "@/lib/importPlanningPreview";
import { formatDate, getSlots, getWeekDays, getWeekStart, toISODate } from "@/lib/utils";
import { inferImportSlotSpan, inferImportSlotSpanDecision } from "@/lib/importPlanning/slotSpanHeuristics";
import { findNextConsecutiveRangeBySlots } from "@/lib/scheduling/nextConsecutiveFreeSuggestion";

type ReviewFilter = "all" | "issues" | "review" | "ignored" | "valid";
const DAY_OPTIONS = ["lunes", "martes", "miércoles", "jueves", "viernes", "día no identificado"];
const ORDERED_WEEK_DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "día no identificado"];
const SHIFT_OPTIONS: Array<PlanningPreviewBlock["shift"]> = ["morning", "afternoon", "unknown"];
const FUNDING_OPTIONS: Array<NonNullable<PlanningPreviewBlock["detectedFunding"]>> = ["SESPA", "Privado", "Mutua", "Mixto", "Desconocido"];
const SHIFT_LABEL: Record<PlanningPreviewBlock["shift"], string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  unknown: "No detectado",
};

function maxSlotsForShift(shift: PlanningPreviewBlock["shift"]): number {
  return shift === "afternoon" ? 5 : 6;
}

interface SimulatedDraftBlock {
  id: string;
  day: string;
  shift: PlanningPreviewBlock["shift"];
  resourceId: ResourceId | "unknown";
  resourceLabel: string;
  surgeon: string;
  funding: NonNullable<PlanningPreviewBlock["detectedFunding"]>;
  sourceText: string;
  source: PlanningPreviewBlock["source"];
  inferredProcedures: string[];
  inferredPatientsCount: number;
  inferredSlotSpan: number;
  spanSource: "manual" | "preset" | "heuristic";
  spanPresetLabel?: string;
  preferredSlotIndex?: number;
  surgeonMode: "recognized" | "manual" | "missing";
}

interface ImportConflict {
  blockId: string;
  reason: string;
  detail: string;
  dateIso?: string;
  shift?: "morning" | "afternoon";
  resourceId?: string;
  originalSlotIndex?: number;
  suggestedSlotIndex?: number;
}

interface ImportResultSummary {
  requested: number;
  ready?: number;
  imported: number;
  conflicts: number;
  pending: number;
  ignored: number;
}

function inferProceduresFromText(text: string): string[] {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, ",")
    .trim();
  const parts = cleaned
    .split(/[,;/]+|\s+-\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  return parts.slice(0, 4);
}

export default function ImportarPlanificacionPage() {
  const router = useRouter();
  const { user, hydrated, logout } = useAuth();
  const { users } = useUsers();
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<PlanningPreviewBlock[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [prevalidating, setPrevalidating] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportResultSummary | null>(null);
  const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);
  const [prevalidationSummary, setPrevalidationSummary] = useState<ImportResultSummary | null>(null);
  const [prevalidationConflicts, setPrevalidationConflicts] = useState<ImportConflict[]>([]);
  const [selectedReadyIds, setSelectedReadyIds] = useState<string[]>([]);
  const [slotOverrides, setSlotOverrides] = useState<Record<string, number>>({});
  const weekDays = useMemo(() => getWeekDays(getWeekStart(new Date())), []);
  const [selectedSimDay, setSelectedSimDay] = useState(0);

  const surgeons = useMemo(
    () =>
      users
        .filter((u) => {
          const r = String(u.role).toLowerCase();
          return r === "cirujano" || r === "endoscopista";
        })
        .map((u) => ({ id: u.id, name: u.name })),
    [users]
  );
  const surgeonNameSet = useMemo(
    () => new Set(surgeons.map((s) => s.name.trim().toLowerCase())),
    [surgeons]
  );

  if (!hydrated || !user) return null;
  if (!hasGestorAccess(user.role)) {
    return (
      <div className="mx-auto mt-10 max-w-3xl px-4">
        <InlineNotice variant="warning">Esta pantalla está disponible solo para perfiles de gestor.</InlineNotice>
      </div>
    );
  }

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setImportError(null);
    setImportSummary(null);
    setImportConflicts([]);
    setPrevalidationSummary(null);
    setPrevalidationConflicts([]);
    setSelectedReadyIds([]);
    setSlotOverrides({});
    setFileName(file.name);
    try {
      const result = await parsePlanningFilePreview(file, surgeons);
      setBlocks(result.blocks);
      setIssues(result.issues);
      if (!result.blocks.length) setError("No se detectaron bloques preliminares en el archivo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al leer el archivo.");
      setBlocks([]);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  const updateBlock = (id: string, patch: Partial<PlanningPreviewBlock>) => {
    setPrevalidationSummary(null);
    setPrevalidationConflicts([]);
    setSelectedReadyIds([]);
    setSlotOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const counters = useMemo(() => {
    const valid = blocks.filter((b) => b.reviewStatus === "valid").length;
    const review = blocks.filter((b) => b.reviewStatus === "review").length;
    const ignored = blocks.filter((b) => b.reviewStatus === "ignored").length;
    const withIssues = blocks.filter((b) => b.hasIssue).length;
    return { valid, review, ignored, withIssues };
  }, [blocks]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      if (filter === "all") return true;
      if (filter === "issues") return b.hasIssue;
      if (filter === "review") return b.reviewStatus === "review";
      if (filter === "ignored") return b.reviewStatus === "ignored";
      if (filter === "valid") return b.reviewStatus === "valid";
      return true;
    });
  }, [blocks, filter]);

  const simulatedDraftBlocks = useMemo<SimulatedDraftBlock[]>(() => {
    return blocks
      .filter((b) => b.reviewStatus === "valid")
      .map((b) => {
        const resourceId = b.correctedResourceId ?? b.resourceId;
        const resourceLabel =
          resourceId === "unknown"
            ? "Sin recurso identificado"
            : RESOURCES.find((r) => r.id === resourceId)?.label ?? b.resourceLabel;
        const effectiveShift = b.correctedShift ?? b.shift;
        const procedures = inferProceduresFromText((b.correctedText ?? "").trim() || b.rawText);
        const spanDecision = inferImportSlotSpanDecision({
          shift: effectiveShift === "afternoon" ? "afternoon" : "morning",
          inferredProcedures: procedures,
          sourceText: (b.correctedText ?? "").trim() || b.rawText,
          explicitSpan: b.correctedSlotSpan,
        });
        return {
          id: b.id,
          day: b.correctedDay ?? b.day,
          shift: b.correctedShift ?? b.shift,
          resourceId,
          resourceLabel,
          surgeon: (b.correctedSurgeon ?? b.detectedSurgeon ?? "").trim(),
          funding: b.correctedFunding ?? b.detectedFunding ?? "Desconocido",
          sourceText: (b.correctedText ?? "").trim() || b.rawText,
          source: b.source,
          inferredProcedures: procedures,
          inferredPatientsCount: procedures.length || 1,
          inferredSlotSpan: spanDecision.slotSpan,
          spanSource: spanDecision.source,
          spanPresetLabel: spanDecision.presetLabel,
          preferredSlotIndex: slotOverrides[b.id],
          surgeonMode: (() => {
            const surgeonValue = (b.correctedSurgeon ?? b.detectedSurgeon ?? "").trim();
            if (!surgeonValue) return "missing";
            return surgeonNameSet.has(surgeonValue.toLowerCase()) ? "recognized" : "manual";
          })(),
        };
      });
  }, [blocks, slotOverrides, surgeonNameSet]);

  const simulatedCalendarViews = useMemo<SlotView[]>(() => {
    const dayToDate: Record<string, string> = {
      lunes: toISODate(weekDays[0]),
      martes: toISODate(weekDays[1]),
      "miércoles": toISODate(weekDays[2]),
      jueves: toISODate(weekDays[3]),
      viernes: toISODate(weekDays[4]),
      "día no identificado": toISODate(weekDays[0]),
    };

    const allViews: SlotView[] = [];
    const occupiedKeys = new Set<string>();
    const orderedBlocks = [...simulatedDraftBlocks].sort((a, b) => {
      if (a.day !== b.day) return ORDERED_WEEK_DAYS.indexOf(a.day) - ORDERED_WEEK_DAYS.indexOf(b.day);
      if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
      if (a.resourceLabel !== b.resourceLabel) return a.resourceLabel.localeCompare(b.resourceLabel);
      return a.id.localeCompare(b.id);
    });

    for (const day of ORDERED_WEEK_DAYS.slice(0, 5)) {
      const iso = dayToDate[day];
      for (const resource of RESOURCES) {
        for (const shift of SHIFT_OPTIONS) {
          if (shift === "unknown") continue;
          const slots = getSlots(shift);
          for (let i = 0; i < slots.length; i++) {
            allViews.push({
              resourceId: resource.id,
              date: iso,
              shift: shift as Shift,
              slotIndex: i,
              status: "free",
            });
          }
        }
      }
    }

    for (const block of orderedBlocks) {
      if (block.shift === "unknown" || block.resourceId === "unknown") continue;
      const iso = dayToDate[block.day] ?? dayToDate.lunes;
      const slots = getSlots(block.shift);
      let selectedSlotIndex = block.preferredSlotIndex ?? 0;
      if (selectedSlotIndex < 0 || selectedSlotIndex >= slots.length) selectedSlotIndex = 0;
      const span = Math.max(1, Math.min(block.inferredSlotSpan, slots.length));
      const suggestion = findNextConsecutiveRangeBySlots({
        startAfterSlotIndex: selectedSlotIndex - 1,
        maxSlotIndex: slots.length - 1,
        requiredSlots: span,
        isSlotFree: (i) => !occupiedKeys.has(`${iso}-${block.shift}-${block.resourceId}-${i}`),
      });
      if (!suggestion) continue;
      for (let i = suggestion.startSlotIndex; i <= suggestion.endSlotIndex; i++) {
        occupiedKeys.add(`${iso}-${block.shift}-${block.resourceId}-${i}`);
        const idx = allViews.findIndex(
          (v) =>
            v.date === iso &&
            v.shift === block.shift &&
            v.resourceId === block.resourceId &&
            v.slotIndex === i
        );
        if (idx < 0) continue;
        allViews[idx] = {
          ...allViews[idx],
          status: "occupied",
          surgeonName: block.surgeon || "Sin asignar",
          patientsCount: block.inferredPatientsCount,
          patientNames:
            i === suggestion.startSlotIndex
              ? [...block.inferredProcedures, `Heurística span: ${span} slot(s)`]
              : [`Continuación de bloque importado (${i - suggestion.startSlotIndex + 1}/${span})`],
          hasSespa: block.funding === "SESPA",
          hasPrivate: block.funding === "Privado" || block.funding === "Mutua" || block.funding === "Mixto",
        };
      }
    }

    return allViews;
  }, [simulatedDraftBlocks, weekDays]);

  const selectedDate = weekDays[selectedSimDay] ?? weekDays[0];
  const selectedDateIso = toISODate(selectedDate);
  const simulatedDayViews = useMemo(
    () => simulatedCalendarViews.filter((v) => v.date === selectedDateIso),
    [simulatedCalendarViews, selectedDateIso]
  );
  const hasAnyValid = simulatedDraftBlocks.length > 0;
  const prevalidationConflictIds = useMemo(
    () => new Set(prevalidationConflicts.map((c) => c.blockId)),
    [prevalidationConflicts]
  );
  const readyBlocks = useMemo(
    () => simulatedDraftBlocks.filter((b) => !prevalidationConflictIds.has(b.id)),
    [simulatedDraftBlocks, prevalidationConflictIds]
  );
  const selectedReadyBlocks = useMemo(
    () => readyBlocks.filter((b) => selectedReadyIds.includes(b.id)),
    [readyBlocks, selectedReadyIds]
  );

  const runImport = async (targetBlocks: SimulatedDraftBlock[], confirmationText: string) => {
    if (!targetBlocks.length) return;
    const confirmed = window.confirm(confirmationText);
    if (!confirmed) return;

    setImporting(true);
    setImportError(null);
    setImportSummary(null);
    setImportConflicts([]);
    try {
      const res = await fetch("/api/import-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          weekStartIso: toISODate(weekDays[0]),
          blocks: targetBlocks.map((b) => ({
            id: b.id,
            day: b.day,
            shift: b.shift,
            resourceId: b.resourceId,
            surgeonName: b.surgeon,
            sourceText: b.sourceText,
            funding: b.funding,
            source: b.source,
            inferredProcedures: b.inferredProcedures,
            inferredSlotSpan: b.inferredSlotSpan,
            preferredSlotIndex: b.preferredSlotIndex,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: { requested: number; imported: number; conflicts: number };
        conflicts?: ImportConflict[];
      };
      if (!res.ok || !data.ok || !data.summary) {
        setImportError(data.error ?? "No se pudo completar la importación.");
        return;
      }

      setImportSummary({
        requested: targetBlocks.length,
        ready: targetBlocks.length,
        imported: data.summary.imported,
        conflicts: data.summary.conflicts,
        pending: counters.review,
        ignored: counters.ignored,
      });
      setImportConflicts(data.conflicts ?? []);
    } catch {
      setImportError("Error de conexión al importar.");
    } finally {
      setImporting(false);
    }
  };

  const handleImportToCalendar = async () => {
    await runImport(
      simulatedDraftBlocks,
      "Se importarán SOLO los bloques válidos al calendario real. Los conflictos se omitirán y se listarán al final. ¿Desea continuar?"
    );
  };

  const handleImportReadyOnly = async () => {
    await runImport(
      selectedReadyBlocks,
      `Se importarán ${selectedReadyBlocks.length} bloques listos seleccionados. Los conflictivos quedarán fuera. ¿Desea continuar?`
    );
  };

  const handlePrevalidateImport = async () => {
    if (!simulatedDraftBlocks.length) return;
    setPrevalidating(true);
    setImportError(null);
    setPrevalidationSummary(null);
    setPrevalidationConflicts([]);
    try {
      const res = await fetch("/api/import-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dryRun: true,
          weekStartIso: toISODate(weekDays[0]),
          blocks: simulatedDraftBlocks.map((b) => ({
            id: b.id,
            day: b.day,
            shift: b.shift,
            resourceId: b.resourceId,
            surgeonName: b.surgeon,
            sourceText: b.sourceText,
            funding: b.funding,
            source: b.source,
            inferredProcedures: b.inferredProcedures,
            inferredSlotSpan: b.inferredSlotSpan,
            preferredSlotIndex: b.preferredSlotIndex,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: { requested: number; ready?: number; imported: number; conflicts: number };
        conflicts?: ImportConflict[];
      };
      if (!res.ok || !data.ok || !data.summary) {
        setImportError(data.error ?? "No se pudo prevalidar el lote.");
        return;
      }
      setPrevalidationSummary({
        requested: data.summary.requested,
        ready: data.summary.ready ?? 0,
        imported: 0,
        conflicts: data.summary.conflicts,
        pending: counters.review,
        ignored: counters.ignored,
      });
      const conflicts = data.conflicts ?? [];
      setPrevalidationConflicts(conflicts);
      const conflictIds = new Set(conflicts.map((c) => c.blockId));
      setSelectedReadyIds(simulatedDraftBlocks.filter((b) => !conflictIds.has(b.id)).map((b) => b.id));
    } catch {
      setImportError("Error de conexión durante la prevalidación.");
    } finally {
      setPrevalidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageShellHeader
          title="Importar planificación (preview)"
          subtitle="Fase 1 segura: carga, parseo y vista previa sin grabar reservas reales."
          roleBadge={roleLabel(user.role)}
          userLine={
            <>
              <button type="button" onClick={() => router.push("/calendario")} className="font-medium text-[var(--ribera-navy)] hover:underline">
                Volver al calendario
              </button>
              <span className="mx-1.5 text-slate-400">·</span>
              <button type="button" onClick={() => { logout(); router.replace("/"); }} className="font-medium text-[var(--ribera-red)] hover:underline">
                Cerrar sesión
              </button>
            </>
          }
        />

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold text-[var(--ribera-navy)]">Subir Excel/PDF de planificación</h2>
          <p className="mt-1 text-sm text-slate-600">
            Formatos soportados: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.pdf</strong>. No se guarda nada en BD en esta fase.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Seleccionar archivo
              <input
                type="file"
                accept=".xlsx,.xls,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
            {fileName ? <StatusBadge tone="info">{fileName}</StatusBadge> : null}
            {loading ? <StatusBadge tone="warning">Procesando archivo…</StatusBadge> : null}
          </div>
          {error ? <InlineNotice variant="error" className="mt-3">{error}</InlineNotice> : null}
        </section>

        {issues.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">Incidencias de parseo</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {issues.slice(0, 25).map((i, idx) => (
                <li key={`${i}-${idx}`}>{i}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-[var(--ribera-navy)]">Vista previa interpretada</h3>
          <p className="mt-1 text-sm text-slate-600">
            Bloques detectados: <strong>{blocks.length}</strong>. Puede revisar qué se ha entendido y qué requiere corrección manual.
          </p>
          {blocks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone="success">Válidos: {counters.valid}</StatusBadge>
              <StatusBadge tone="warning">Pendientes: {counters.review}</StatusBadge>
              <StatusBadge tone="neutral">Ignorados: {counters.ignored}</StatusBadge>
              <StatusBadge tone="danger">Con incidencias: {counters.withIssues}</StatusBadge>
            </div>
          )}
          {blocks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                { id: "all", label: "Todos" },
                { id: "issues", label: "Con incidencias" },
                { id: "review", label: "Pendientes" },
                { id: "ignored", label: "Ignorados" },
                { id: "valid", label: "Válidos" },
              ] as Array<{ id: ReviewFilter; label: string }>).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    filter === f.id
                      ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {blocks.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-500">
              Aún no hay bloques detectados.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1300px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 font-semibold text-slate-700">Estado</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Día</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Turno</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Recurso</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Texto original</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Texto corregido</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Cirujano</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Financiación</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Span (slots)</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Origen parseo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlocks.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <select
                          value={b.reviewStatus}
                          onChange={(e) => updateBlock(b.id, { reviewStatus: e.target.value as PlanningPreviewBlock["reviewStatus"] })}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="valid">Válido</option>
                          <option value="review">Pendiente</option>
                          <option value="ignored">Ignorar</option>
                        </select>
                        {b.hasIssue && <p className="mt-1 text-[11px] text-amber-700">Incidencia inicial</p>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={b.correctedDay ?? b.day}
                          onChange={(e) => updateBlock(b.id, { correctedDay: e.target.value })}
                          className="w-[140px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">Detectado: {b.day}</p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={b.correctedShift ?? b.shift}
                          onChange={(e) => updateBlock(b.id, { correctedShift: e.target.value as PlanningPreviewBlock["shift"] })}
                          className="w-[120px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {SHIFT_OPTIONS.map((s) => <option key={s} value={s}>{s === "morning" ? "Mañana" : s === "afternoon" ? "Tarde" : "No detectado"}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">Detectado: {b.shift === "morning" ? "Mañana" : b.shift === "afternoon" ? "Tarde" : "No detectado"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={b.correctedResourceId ?? b.resourceId}
                          onChange={(e) => {
                            const rid = e.target.value as ResourceId | "unknown";
                            updateBlock(b.id, { correctedResourceId: rid });
                          }}
                          className="w-[190px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="unknown">Sin recurso identificado</option>
                          {RESOURCES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">Detectado: {b.resourceLabel}</p>
                      </td>
                      <td className="max-w-[320px] px-3 py-2 text-slate-800">{b.rawText}</td>
                      <td className="px-3 py-2">
                        <textarea
                          value={b.correctedText ?? b.rawText}
                          onChange={(e) => updateBlock(b.id, { correctedText: e.target.value })}
                          className="min-h-[70px] w-[320px] rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={b.correctedSurgeon ?? b.detectedSurgeon ?? ""}
                          onChange={(e) => updateBlock(b.id, { correctedSurgeon: e.target.value || undefined })}
                          className="w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          list="import-surgeon-candidates"
                          placeholder="Nombre libre o cirujano conocido"
                        />
                        <datalist id="import-surgeon-candidates">
                          {surgeons.map((s) => (
                            <option key={s.id} value={s.name} />
                          ))}
                        </datalist>
                        <p className="mt-1 text-[11px] text-slate-500">Detectado: {b.detectedSurgeon ?? "—"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={b.correctedFunding ?? b.detectedFunding ?? "Desconocido"}
                          onChange={(e) => updateBlock(b.id, { correctedFunding: e.target.value as NonNullable<PlanningPreviewBlock["detectedFunding"]> })}
                          className="w-[140px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          {FUNDING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-500">Detectado: {b.detectedFunding ?? "Desconocido"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          max={maxSlotsForShift(b.correctedShift ?? b.shift)}
                          value={b.correctedSlotSpan ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) {
                              updateBlock(b.id, { correctedSlotSpan: undefined });
                              return;
                            }
                            const n = parseInt(raw, 10);
                            if (!Number.isFinite(n) || n <= 0) {
                              updateBlock(b.id, { correctedSlotSpan: undefined });
                              return;
                            }
                            updateBlock(b.id, {
                              correctedSlotSpan: Math.min(maxSlotsForShift(b.correctedShift ?? b.shift), Math.max(1, n)),
                            });
                          }}
                          className="w-[88px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Heurístico:{" "}
                          {inferImportSlotSpan({
                            shift: (b.correctedShift ?? b.shift) === "afternoon" ? "afternoon" : "morning",
                            inferredProcedures: inferProceduresFromText((b.correctedText ?? "").trim() || b.rawText),
                            sourceText: (b.correctedText ?? "").trim() || b.rawText,
                          })}
                          {b.correctedSlotSpan ? ` · Manual: ${b.correctedSlotSpan}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={b.source === "excel" ? "info" : "neutral"}>{b.source.toUpperCase()}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-[var(--ribera-navy)]">Semana simulada en formato calendario QxFlow</h3>
          <p className="mt-1 text-sm text-slate-600">
            Vista cuadro por cuadro con bloques <strong>válidos</strong>. Es un borrador de importación: no escribe en reservas reales.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="success">Listos para importar: {counters.valid}</StatusBadge>
            <StatusBadge tone="warning">Pendientes: {counters.review}</StatusBadge>
            <StatusBadge tone="neutral">Ignorados: {counters.ignored}</StatusBadge>
            <StatusBadge tone="info">Origen: archivo importado (no BD)</StatusBadge>
            <StatusBadge tone="success">
              Cirujano reconocido: {simulatedDraftBlocks.filter((b) => b.surgeonMode === "recognized").length}
            </StatusBadge>
            <StatusBadge tone="warning">
              Nombre libre: {simulatedDraftBlocks.filter((b) => b.surgeonMode === "manual").length}
            </StatusBadge>
            <StatusBadge tone="danger">
              Sin cirujano: {simulatedDraftBlocks.filter((b) => b.surgeonMode === "missing").length}
            </StatusBadge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrevalidateImport}
              disabled={!hasAnyValid || prevalidating}
              className="btn-ribera-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prevalidating ? "Prevalidando lote..." : "Prevalidar lote"}
            </button>
            <button
              type="button"
              onClick={handleImportToCalendar}
              disabled={!hasAnyValid || importing || prevalidating}
              className="btn-ribera-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importando al calendario..." : "Importar al calendario"}
            </button>
            <button
              type="button"
              onClick={handleImportReadyOnly}
              disabled={!prevalidationSummary || selectedReadyBlocks.length === 0 || importing || prevalidating}
              className="btn-ribera-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importando listos..." : `Importar solo listos (${selectedReadyBlocks.length})`}
            </button>
            <p className="text-xs text-slate-500">
              Importación segura: solo bloques válidos, sin sobrescribir huecos ocupados.
            </p>
          </div>
          {prevalidationSummary ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-sm font-semibold text-sky-900">Prevalidación del lote (sin escribir en BD)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone="success">Listos para importar: {prevalidationSummary.ready ?? 0}</StatusBadge>
                <StatusBadge tone="warning">Con conflicto: {prevalidationSummary.conflicts}</StatusBadge>
                <StatusBadge tone="neutral">Pendientes: {prevalidationSummary.pending}</StatusBadge>
                <StatusBadge tone="neutral">Ignorados: {prevalidationSummary.ignored}</StatusBadge>
              </div>
            </div>
          ) : null}
          {prevalidationConflicts.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Conflictos detectados antes de importar</p>
              <div className="mt-2 space-y-2">
                {prevalidationConflicts.slice(0, 25).map((c) => (
                  <div key={`pre-${c.blockId}-${c.reason}`} className="rounded border border-amber-200 bg-white p-2 text-xs text-amber-900">
                    <p>
                      <span className="font-semibold">[{c.blockId}]</span> {c.detail}
                    </p>
                    {c.reason === "slot_conflict_existing" && c.originalSlotIndex != null ? (
                      <p className="mt-1 text-amber-800">
                        Slot original: {c.originalSlotIndex}
                        {c.suggestedSlotIndex != null ? ` · Siguiente hueco libre sugerido: ${c.suggestedSlotIndex}` : " · Sin alternativa en ese turno/recurso."}
                      </p>
                    ) : null}
                    {c.reason === "slot_conflict_existing" && c.suggestedSlotIndex != null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSlotOverrides((prev) => ({ ...prev, [c.blockId]: c.suggestedSlotIndex as number }));
                          setPrevalidationSummary(null);
                          setPrevalidationConflicts((prev) => prev.filter((x) => x.blockId !== c.blockId));
                          setSelectedReadyIds((prev) => [...new Set([...prev, c.blockId])]);
                        }}
                        className="mt-1.5 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-200"
                      >
                        Usar sugerencia
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {prevalidationSummary ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-900">Bloques listos (seleccionables)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReadyIds(readyBlocks.map((b) => b.id))}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Seleccionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReadyIds([])}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Limpiar selección
                  </button>
                </div>
              </div>
              {readyBlocks.length === 0 ? (
                <p className="mt-2 text-xs text-emerald-900">No hay bloques listos en esta prevalidación.</p>
              ) : (
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  {readyBlocks.map((b) => (
                    <label key={`ready-${b.id}`} className="flex items-start gap-2 rounded border border-emerald-200 bg-white p-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedReadyIds.includes(b.id)}
                        onChange={(e) => {
                          setSelectedReadyIds((prev) =>
                            e.target.checked ? [...new Set([...prev, b.id])] : prev.filter((id) => id !== b.id)
                          );
                        }}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold">{b.resourceLabel}</span> · {SHIFT_LABEL[b.shift]} · {b.surgeon}
                        <span className="ml-1 text-slate-600">· Span aplicado: {b.inferredSlotSpan} slot(s)</span>
                        {b.spanSource === "preset" && b.spanPresetLabel ? (
                          <span className="ml-1 text-indigo-700">· Preset: {b.spanPresetLabel}</span>
                        ) : null}
                        {b.spanSource === "manual" ? (
                          <span className="ml-1 text-emerald-700">· Ajuste manual</span>
                        ) : null}
                        {b.preferredSlotIndex != null ? (
                          <span className="ml-1 text-emerald-700">· Slot final: {b.preferredSlotIndex} (sugerido)</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {importError ? (
            <InlineNotice variant="error" className="mt-3">
              {importError}
            </InlineNotice>
          ) : null}
          {importSummary ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">Importación completada</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone="success">Importados: {importSummary.imported}</StatusBadge>
                <StatusBadge tone="warning">Conflictos: {importSummary.conflicts}</StatusBadge>
                <StatusBadge tone="neutral">Pendientes no importados: {importSummary.pending}</StatusBadge>
                <StatusBadge tone="neutral">Ignorados: {importSummary.ignored}</StatusBadge>
              </div>
            </div>
          ) : null}
          {importConflicts.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Bloques con conflicto (no importados)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
                {importConflicts.slice(0, 25).map((c) => (
                  <li key={`${c.blockId}-${c.reason}`}>
                    [{c.blockId}] {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {simulatedDraftBlocks.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">No hay bloques válidos para construir la semana simulada.</p>
              <p className="mt-1 text-xs text-slate-500">Marque bloques como “Válido” para ver el borrador importable.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {weekDays.map((d, idx) => (
                  <button
                    key={toISODate(d)}
                    type="button"
                    onClick={() => setSelectedSimDay(idx)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      selectedSimDay === idx
                        ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {formatDate(d)}
                  </button>
                ))}
              </div>
              <InlineNotice variant="info">
                Los cuadros mostrados abajo son simulados desde el archivo importado. No representan reservas persistidas en la base de datos.
              </InlineNotice>
              <InlineNotice variant="warning">
                Regla de importación de cirujano: si coincide con usuario real se usa ese cirujano; si no, se importa como nombre libre (`externalSurgeonName`); si está vacío, el bloque quedará en conflicto.
              </InlineNotice>
              <DaySlotGrid
                date={selectedDate}
                dateLabel={`Borrador importable · ${formatDate(selectedDate)}`}
                allowedResources={RESOURCES}
                slotViews={simulatedDayViews}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trazabilidad del día seleccionado</p>
                {!hasAnyValid ? (
                  <p className="mt-1 text-xs text-slate-500">Sin bloques válidos.</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {simulatedDraftBlocks
                      .filter((b) => {
                        const dayMap: Record<string, string> = {
                          lunes: toISODate(weekDays[0]),
                          martes: toISODate(weekDays[1]),
                          "miércoles": toISODate(weekDays[2]),
                          jueves: toISODate(weekDays[3]),
                          viernes: toISODate(weekDays[4]),
                          "día no identificado": toISODate(weekDays[0]),
                        };
                        return (dayMap[b.day] ?? dayMap.lunes) === selectedDateIso;
                      })
                      .map((b) => (
                        <p key={b.id} className="text-xs text-slate-700">
                          <span className="font-medium">{b.resourceLabel}</span> · {SHIFT_LABEL[b.shift]} · {b.surgeon || "Sin asignar"} · {b.funding} · {b.source.toUpperCase()} ·{" "}
                          span aplicado {b.inferredSlotSpan} slot(s) ·{" "}
                          {b.spanSource === "preset" && b.spanPresetLabel ? `preset ${b.spanPresetLabel} · ` : ""}
                          {b.spanSource === "manual" ? "ajuste manual · " : ""}
                          {b.surgeonMode === "recognized"
                            ? "cirujano reconocido"
                            : b.surgeonMode === "manual"
                              ? "nombre libre"
                              : "sin cirujano"}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

