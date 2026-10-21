"use client";

import { useCallback, useEffect, useState } from "react";

interface HabitRow {
  userId: string;
  name: string;
  source: "profile" | "catalog" | "none";
  saved: { defaultShift: "morning" | "afternoon" | null; preferredResourceId: string | null; active: boolean } | null;
  suggestion: { shift: "morning" | "afternoon" | null; resourceId: string | null; flags: string[] };
}

export function SurgeonHabitEditor() {
  const [rows, setRows] = useState<HabitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/surgeon-defaults", { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudieron cargar los hábitos");
    setRows((payload as { defaults?: HabitRow[] }).defaults ?? []);
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar los hábitos"));
  }, [load]);

  const save = async (row: HabitRow, patch: { defaultShift: "morning" | "afternoon" | null; preferredResourceId: string | null }) => {
    setSavingId(row.userId);
    setError(null);
    try {
      const response = await fetch("/api/surgeon-defaults", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.userId, active: true, ...patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo guardar");
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-800">Turno y quirófano habitual</h3>
      <p className="mb-3 text-xs text-gray-500">
        Muel, Huéscar y Corona salen de mañana; Blanco, de tarde; Huéscar en Q2. Es una sugerencia marcada TURNO_INFERIDO. No crea la reserva.
      </p>
      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => {
          const shift = row.saved?.defaultShift ?? row.suggestion.shift ?? "";
          const resource = row.saved?.preferredResourceId ?? row.suggestion.resourceId ?? "";
          return (
            <li key={row.userId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-40 font-medium text-gray-800">{row.name}</span>
              <select
                aria-label={`Turno de ${row.name}`}
                value={shift}
                onChange={(event) => {
                  const defaultShift = event.target.value === "morning" || event.target.value === "afternoon" ? event.target.value : null;
                  void save(row, { defaultShift, preferredResourceId: resource || null });
                }}
                className="rounded border border-gray-300 px-2 py-1"
              >
                <option value="">Sin turno</option>
                <option value="morning">Mañana</option>
                <option value="afternoon">Tarde</option>
              </select>
              <select
                aria-label={`Quirófano de ${row.name}`}
                value={resource}
                onChange={(event) => {
                  const defaultShift = shift === "morning" || shift === "afternoon" ? shift : null;
                  void save(row, { defaultShift, preferredResourceId: event.target.value || null });
                }}
                className="rounded border border-gray-300 px-2 py-1"
              >
                <option value="">Sin quirófano</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
              </select>
              <span className="text-xs text-gray-500">
                {savingId === row.userId ? "Guardando…" : row.source === "profile" ? "guardado" : row.suggestion.flags.join(" ") || "sin sugerencia"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
