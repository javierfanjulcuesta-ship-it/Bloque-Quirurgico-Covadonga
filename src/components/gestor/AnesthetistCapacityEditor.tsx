"use client";

import { useCallback, useEffect, useState } from "react";

interface CapacityRow {
  userId: string;
  name: string;
  maxSimultaneousOr: number;
  source: "profile" | "catalog" | "default";
}

export function AnesthetistCapacityEditor() {
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/anesthetist-profiles", { credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo cargar el cupo");
    const profiles = (payload as { profiles?: CapacityRow[] }).profiles ?? [];
    setRows(profiles);
    setDrafts(Object.fromEntries(profiles.map((row) => [row.userId, String(row.maxSimultaneousOr)])));
  }, []);

  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo cargar el cupo"));
  }, [load]);

  const save = async (userId: string) => {
    const maxSimultaneousOr = Number(drafts[userId]);
    setSavingId(userId);
    setError(null);
    try {
      const response = await fetch("/api/anesthetist-profiles", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, maxSimultaneousOr }),
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
      <h3 className="text-base font-semibold text-gray-800">Cupo de quirófanos por anestesista</h3>
      <p className="mb-3 text-xs text-gray-500">
        Por defecto 2 quirófanos simultáneos en el mismo turno. El catálogo inicial deja 3 a Cárcelen y Fanjul, y 2 a Dura, hasta que se guarde un valor propio. El servidor rechaza lo que lo supere.
      </p>
      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No hay anestesistas activos.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-40 font-medium text-gray-800">{row.name}</span>
              <input
                type="number"
                min={1}
                max={6}
                value={drafts[row.userId] ?? ""}
                onChange={(event) => setDrafts((current) => ({ ...current, [row.userId]: event.target.value }))}
                className="w-20 rounded border border-gray-300 px-2 py-1"
                aria-label={`Cupo de ${row.name}`}
              />
              <span className="text-xs text-gray-500">{row.source === "profile" ? "guardado" : row.source === "catalog" ? "catálogo" : "defecto 2"}</span>
              <button
                type="button"
                onClick={() => save(row.userId)}
                disabled={savingId === row.userId}
                className="rounded border border-[var(--ribera-red)] px-3 py-1 text-xs font-medium text-[var(--ribera-red)] disabled:opacity-50"
              >
                {savingId === row.userId ? "Guardando…" : "Guardar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
