"use client";

/**
 * Pestaña Normas para GESTOR/GESTOR_ANESTESISTA.
 * Listado de reglas editables con formulario básico.
 */

import { useState, useEffect, useCallback } from "react";

interface ProgrammingRuleFull {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  valueJson: string | null;
  isActive: boolean;
  updatedAt: string;
}

export function NormasGestorView() {
  const [rules, setRules] = useState<ProgrammingRuleFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/programming-rules", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setRules(data.rules ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar normas");
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const startEdit = (rule: ProgrammingRuleFull) => {
    setEditingId(rule.id);
    setEditValue(rule.valueJson ?? "");
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const rule = rules.find((r) => r.id === editingId);
    let valueToSend = editValue;
    if (rule && ["scheduling_deadline_day", "scheduling_deadline_hour", "scheduling_deadline_minute", "transition_minutes", "max_weeks_ahead"].includes(rule.key)) {
      const n = Number(editValue);
      if (Number.isNaN(n)) {
        setSaveError("Debe ser un número");
        return;
      }
      valueToSend = JSON.stringify(n);
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/programming-rules/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ valueJson: valueToSend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      await fetchRules();
      cancelEdit();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
        <p className="text-sm text-gray-500">Cargando…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
      <p className="mb-4 text-sm text-gray-600">
        Reglas editables. Los cambios afectan a correos, pestaña Normas de cirujanos y, cuando esté conectado, a la lógica de cierre.
      </p>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-800">{rule.name}</h3>
                {rule.description && (
                  <p className="text-xs text-gray-500">{rule.description}</p>
                )}
              </div>
              <span className="shrink-0 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                {rule.key}
              </span>
            </div>

            {editingId === rule.id ? (
              <div className="space-y-2">
                {rule.key === "normas_texto_completo" ? (
                  <textarea
                    value={editValue.startsWith("{") ? (() => {
                      try {
                        const o = JSON.parse(editValue);
                        return typeof o?.text === "string" ? o.text : editValue;
                      } catch {
                        return editValue;
                      }
                    })() : editValue}
                    onChange={(e) => {
                      const text = e.target.value;
                      setEditValue(JSON.stringify({ text }));
                    }}
                    rows={12}
                    className="w-full rounded border border-gray-300 p-2 font-mono text-sm"
                  />
                ) : (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full rounded border border-gray-300 p-2 font-mono text-sm"
                  />
                )}
                {saveError && (
                  <p className="text-sm text-red-600">{saveError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <pre className="max-h-24 overflow-auto rounded bg-white p-2 text-xs text-gray-700">
                  {rule.key === "normas_texto_completo"
                    ? (() => {
                        try {
                          const o = rule.valueJson ? JSON.parse(rule.valueJson) : null;
                          const t = o?.text;
                          return typeof t === "string" ? t.slice(0, 200) + (t.length > 200 ? "…" : "") : rule.valueJson ?? "";
                        } catch {
                          return rule.valueJson ?? "";
                        }
                      })()
                    : rule.valueJson ?? ""}
                </pre>
                <button
                  type="button"
                  onClick={() => startEdit(rule)}
                  className="shrink-0 rounded-lg border border-[var(--ribera-red)] px-3 py-1.5 text-sm font-medium text-[var(--ribera-red)] hover:bg-[var(--ribera-red-pale)]"
                >
                  Editar
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Última actualización: {rule.updatedAt ? new Date(rule.updatedAt).toLocaleString("es-ES") : "—"}
            </p>
          </div>
        ))}
      </div>

      {rules.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-gray-500">
          No hay reglas. Ejecuta <code className="rounded bg-gray-100 px-1">npx tsx scripts/seed-programming-rules.ts</code>.
        </p>
      )}
    </section>
  );
}
