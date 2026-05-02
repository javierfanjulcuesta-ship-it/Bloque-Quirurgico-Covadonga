"use client";

/**
 * Pestaña Normas para GESTOR/GESTOR_ANESTESISTA.
 * Listado de reglas editables con formulario básico.
 * Si la API falla, muestra normas estáticas como fallback (nunca "no disponible").
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { NORMAS_PROGRAMACION_BLOQUE } from "@/lib/email/emailConstants";
import { ADMIN_NOTIFICATION_EMAIL_RULE_KEY } from "@/lib/reservations/surgicalCircuitConstants";

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

function parseAdminEmailFromValueJson(valueJson: string | null | undefined): string {
  const raw = valueJson?.trim();
  if (!raw) return "";
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === "string" ? v : "";
  } catch {
    return raw.replace(/^"|"$/g, "");
  }
}

const ADMIN_EMAIL_LABEL = "Email administrativo para financiación/autorizaciones";

export function NormasGestorView() {
  const [rules, setRules] = useState<ProgrammingRuleFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSaveError, setAdminSaveError] = useState<string | null>(null);

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

  const adminSyncToken = useMemo(() => {
    const r = rules.find((x) => x.key === ADMIN_NOTIFICATION_EMAIL_RULE_KEY);
    return r ? `${r.id}:${r.updatedAt}` : "";
  }, [rules]);

  useEffect(() => {
    if (!adminSyncToken) return;
    const r = rules.find((x) => x.key === ADMIN_NOTIFICATION_EMAIL_RULE_KEY);
    if (!r) return;
    setAdminEmail(parseAdminEmailFromValueJson(r.valueJson));
  }, [adminSyncToken]);

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
    if (!rule) return;
    let valueToSend = editValue;
    if (
      rule &&
      ["scheduling_deadline_day", "scheduling_deadline_hour", "scheduling_deadline_minute", "transition_minutes", "max_weeks_ahead"].includes(rule.key)
    ) {
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

  const saveAdminEmail = async () => {
    const adminRule = rules.find((r) => r.key === ADMIN_NOTIFICATION_EMAIL_RULE_KEY);
    if (!adminRule) {
      setAdminSaveError("No existe la regla admin_notification_email en la base de datos. Ejecute el seed de reglas.");
      return;
    }
    const t = adminEmail.trim();
    if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      setAdminSaveError("Introduzca un email válido o déjelo vacío");
      return;
    }
    setAdminSaving(true);
    setAdminSaveError(null);
    try {
      const res = await fetch(`/api/programming-rules/${adminRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ valueJson: JSON.stringify(t) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      await fetchRules();
    } catch (e) {
      setAdminSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setAdminSaving(false);
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
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Las reglas editables no están disponibles temporalmente ({error}). A continuación las normas estáticas de referencia:
        </p>
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 font-sans text-sm text-gray-700">{NORMAS_PROGRAMACION_BLOQUE}</pre>
      </section>
    );
  }

  const adminRule = rules.find((r) => r.key === ADMIN_NOTIFICATION_EMAIL_RULE_KEY);
  const rulesSinAdmin = rules.filter((r) => r.key !== ADMIN_NOTIFICATION_EMAIL_RULE_KEY);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Normas de programación</h2>
      <p className="mb-4 text-sm text-gray-600">
        Reglas editables. Los cambios afectan a correos, pestaña Normas de cirujanos y, cuando esté conectado, a la lógica de cierre.
      </p>

      <div className="mb-8 rounded-lg border border-slate-200 bg-slate-50/80 p-5">
        <h3 className="text-lg font-semibold text-[var(--ribera-navy)]">Notificaciones administrativas</h3>
        <p className="mt-1 text-sm text-gray-600">
          No crea un usuario administrativo; solo recibe avisos por correo.
        </p>
        {adminRule ? (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="admin-notification-email" className="mb-1 block text-sm font-medium text-gray-800">
                {ADMIN_EMAIL_LABEL}
              </label>
              <input
                id="admin-notification-email"
                type="email"
                autoComplete="off"
                placeholder="ej. administracion@centro.es (opcional)"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  setAdminSaveError(null);
                }}
                className="w-full max-w-xl rounded border border-gray-300 bg-white p-2 text-sm"
              />
            </div>
            {adminSaveError && <p className="text-sm text-red-600">{adminSaveError}</p>}
            <button
              type="button"
              onClick={saveAdminEmail}
              disabled={adminSaving}
              className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adminSaving ? "Guardando…" : "Guardar email administrativo"}
            </button>
            <p className="text-xs text-gray-500">
              Última actualización:{" "}
              {adminRule.updatedAt ? new Date(adminRule.updatedAt).toLocaleString("es-ES") : "—"}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-amber-800">
            Falta la regla <code className="rounded bg-white px-1">admin_notification_email</code>. Ejecute{" "}
            <code className="rounded bg-white px-1">npm run rules:seed</code>.
          </p>
        )}
      </div>

      <h3 className="mb-3 text-base font-semibold text-gray-800">Otras reglas</h3>
      <div className="space-y-4">
        {rulesSinAdmin.map((rule) => (
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
