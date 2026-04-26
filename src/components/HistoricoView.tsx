"use client";

/**
 * Pestaña Histórico: procedimientos en los que ha participado el usuario (cirujano, endoscopista o anestesista)
 * en el marco temporal elegido.
 */

import { useState, useMemo } from "react";
import { getStoredReservations } from "@/lib/storageMensajesYNotificaciones";
import { toISODate } from "@/lib/utils";
import { RESOURCES } from "@/lib/constants";
import type { User, Reservation } from "@/lib/types";
import { hasAnesthetistAccess } from "@/lib/types";

interface HistoricoViewProps {
  user: User;
  /** Reservas (para cirujano/endoscopista); anestesista usará asignaciones cuando existan */
  reservations?: Reservation[];
}

export function HistoricoView({ user, reservations: propReservations }: HistoricoViewProps) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toISODate(d);
  });
  const [dateTo, setDateTo] = useState(() => toISODate(new Date()));

  const stored = getStoredReservations();
  const reservations = propReservations ?? stored;

  const isAnestesista = hasAnesthetistAccess(user.role);
  const isCirujanoOrEndoscopista = user.role === "cirujano" || user.role === "endoscopista";

  const items = useMemo(() => {
    if (isCirujanoOrEndoscopista) {
      return reservations.filter((r) => {
        if (r.date < dateFrom || r.date > dateTo) return false;
        if (r.surgeonId === user.id) return true;
        return false;
      });
    }
    return [];
  }, [reservations, dateFrom, dateTo, user.id, isCirujanoOrEndoscopista]);

  const resourceLabel = (id: string) => RESOURCES.find((r) => r.id === id)?.label ?? id;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Histórico</h2>
      <p className="mb-4 text-sm text-gray-600">
        Procedimientos en los que ha participado en el marco temporal que desee.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isAnestesista && !isCirujanoOrEndoscopista && (
        <p className="text-gray-500">
          El histórico del anestesista se mostrará aquí en función de las asignaciones a turnos (en desarrollo).
        </p>
      )}

      {isCirujanoOrEndoscopista && (
        <>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">No hay procedimientos en el periodo seleccionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="p-2 font-semibold text-gray-700">Fecha</th>
                    <th className="p-2 font-semibold text-gray-700">Recurso</th>
                    <th className="p-2 font-semibold text-gray-700">Turno</th>
                    <th className="p-2 font-semibold text-gray-700">Pacientes / Procedimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex)
                    .map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2">{r.date}</td>
                        <td className="p-2">{resourceLabel(r.resourceId)}</td>
                        <td className="p-2">{r.shift === "morning" ? "Mañana" : "Tarde"}</td>
                        <td className="p-2">
                          {r.patients.length === 0
                            ? "—"
                            : r.patients.map((p) => `${p.numeroHistoria ?? ""} ${p.procedure ?? ""}`.trim() || "—").join("; ")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
