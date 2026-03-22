"use client";

/**
 * Pestaña "Últimas liberaciones a bolsa común" en área cirujano. Solo lectura.
 */

import { useState, useEffect } from "react";

interface ReleasedSlot {
  date: string;
  shift: string;
  resourceId: string;
  resourceLabel: string;
  releasedAt: string;
}

interface UltimasLiberacionesViewProps {
  onGoToReservar?: () => void;
}

export function UltimasLiberacionesView({ onGoToReservar }: UltimasLiberacionesViewProps) {
  const [releases, setReleases] = useState<ReleasedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/common-pool-releases")
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar");
        return r.json();
      })
      .then((data) => setReleases(data.releases ?? []))
      .catch(() => setError("No se han podido cargar las liberaciones."))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const formatReleasedAt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Últimas liberaciones a bolsa común</h2>
        <p className="text-sm text-gray-500">Cargando…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Últimas liberaciones a bolsa común</h2>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Últimas liberaciones a bolsa común</h2>
      <p className="mb-4 text-sm text-gray-600">
        Huecos liberados recientemente tras el cierre de programación. Puede reservarlos o programar pacientes desde la pestaña &quot;Reservar / programar&quot;.
      </p>
      {releases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 text-center">
          <p className="text-gray-500">No hay liberaciones recientes.</p>
          <p className="mt-2 text-sm text-gray-400">Los huecos que se liberen tras el cierre del jueves aparecerán aquí.</p>
          {onGoToReservar && (
            <button
              type="button"
              onClick={onGoToReservar}
              className="mt-4 rounded-lg border border-[var(--ribera-navy)] px-4 py-2 text-sm font-medium text-[var(--ribera-navy)] hover:bg-[var(--ribera-navy)]/10"
            >
              Ir a Reservar / programar
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Turno</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Recurso</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">Liberado</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r, i) => (
                <tr key={`${r.date}-${r.shift}-${r.resourceId}-${i}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-800">{formatDate(r.date)}</td>
                  <td className="px-3 py-2 text-gray-800">{r.shift}</td>
                  <td className="px-3 py-2 text-gray-800">{r.resourceLabel}</td>
                  <td className="px-3 py-2 text-gray-600">{formatReleasedAt(r.releasedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {onGoToReservar && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onGoToReservar}
                className="rounded-lg border border-[var(--ribera-navy)] px-4 py-2 text-sm font-medium text-[var(--ribera-navy)] hover:bg-[var(--ribera-navy)]/10"
              >
                Ir a Reservar / programar
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
