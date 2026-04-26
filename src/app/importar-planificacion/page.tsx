"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/context/UsersContext";
import { hasGestorAccess, roleLabel } from "@/lib/types";
import { RESOURCES } from "@/lib/constants";
import type { ResourceId } from "@/lib/types";
import { PageShellHeader } from "@/components/ui/PageShellHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { parsePlanningFilePreview, type PlanningPreviewBlock } from "@/lib/importPlanningPreview";

type ReviewFilter = "all" | "issues" | "review" | "ignored" | "valid";
const DAY_OPTIONS = ["lunes", "martes", "miércoles", "jueves", "viernes", "día no identificado"];
const SHIFT_OPTIONS: Array<PlanningPreviewBlock["shift"]> = ["morning", "afternoon", "unknown"];
const FUNDING_OPTIONS: Array<NonNullable<PlanningPreviewBlock["detectedFunding"]>> = ["SESPA", "Privado", "Mutua", "Mixto", "Desconocido"];

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

  return (
    <div className="min-h-screen bg-white p-4">
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
                        <select
                          value={b.correctedSurgeon ?? b.detectedSurgeon ?? ""}
                          onChange={(e) => updateBlock(b.id, { correctedSurgeon: e.target.value || undefined })}
                          className="w-[190px] rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Sin asignar</option>
                          {surgeons.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
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
                        <StatusBadge tone={b.source === "excel" ? "info" : "neutral"}>{b.source.toUpperCase()}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

