"use client";

/**
 * Pestaña del gestor: asignar anestesista a cada turno (recurso + fecha + mañana/tarde).
 * Enlazado con los pacientes programados en el calendario: se muestran los procedimientos
 * y los turnos con algún paciente privado aparecen en naranja.
 */

import { useState, useMemo, useEffect, Fragment } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { RESOURCES } from "@/lib/constants";
import { getUsers } from "@/lib/dataHelpers";
import { hasAnesthetistAccess } from "@/lib/types";
import type { AnesthetistAssignment, ResourceId, Reservation, Shift } from "@/lib/types";
import {
  getStoredAnesthetistAssignments,
  setStoredAnesthetistAssignments,
  getAnesthetistsOverLimit,
} from "@/lib/storageAnesthetistAssignments";
import { getStoredReservations } from "@/lib/storageMensajesYNotificaciones";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";

type SlotType = ResourceId;

function isPrivateFunding(entidadFinanciadora: string | undefined): boolean {
  return !!(entidadFinanciadora?.trim() && /privad/i.test(entidadFinanciadora.trim()));
}

/** Procedimientos programados en un turno (recurso + fecha + mañana/tarde) y si hay paciente privado */
function getSlotProcedures(
  reservations: Reservation[],
  dateStr: string,
  shift: Shift,
  resourceId: ResourceId
): { procedures: string[]; hasPrivate: boolean } {
  const procedures: string[] = [];
  let hasPrivate = false;
  reservations
    .filter((r) => r.date === dateStr && r.shift === shift && r.resourceId === resourceId && r.patients?.length)
    .forEach((r) => {
      r.patients.forEach((p) => {
        procedures.push(p.procedure || p.numeroHistoria || "—");
        if (isPrivateFunding(p.entidadFinanciadora)) hasPrivate = true;
      });
    });
  return { procedures, hasPrivate };
}

const anesthetists = () => getUsers().filter((u) => hasAnesthetistAccess(u.role));

interface AsignarAnestesistasProps {
  /** Reservas del calendario (pacientes programados); si no se pasan, se leen de localStorage */
  reservations?: Reservation[];
}

export function AsignarAnestesistas({ reservations: propReservations }: AsignarAnestesistasProps = {}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [assignments, setAssignments] = useState<AnesthetistAssignment[]>([]);
  const [alarm, setAlarm] = useState<{ over: { date: string; shift: Shift; anesthetistId: string; count: number }[]; pending: AnesthetistAssignment[] } | null>(null);

  const reservations = useMemo(
    () => propReservations ?? getStoredReservations(),
    [propReservations]
  );

  useEffect(() => {
    setAssignments(getStoredAnesthetistAssignments());
  }, []);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const anestList = useMemo(() => anesthetists(), []);

  const getAssignment = (date: string, shift: Shift, slotType: SlotType): string => {
    const a = assignments.find(
      (x) => x.date === date && x.shift === shift && x.slotType === slotType
    );
    return a?.anesthetistId ?? "";
  };

  const setAssignment = (date: string, shift: Shift, slotType: SlotType, anesthetistId: string) => {
    const list = [...assignments];
    const existing = list.find(
      (x) => x.date === date && x.shift === shift && x.slotType === slotType
    );
    if (!anesthetistId) {
      setAssignments(list.filter((a) => !(a.date === date && a.shift === shift && a.slotType === slotType)));
      return;
    }
    const newOne: AnesthetistAssignment = {
      id: existing?.id ?? `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      shift,
      slotType,
      anesthetistId,
    };
    const next = existing
      ? list.map((a) => (a.id === existing.id ? newOne : a))
      : [...list.filter((a) => !(a.date === date && a.shift === shift && a.slotType === slotType)), newOne];
    setAssignments(next);
  };

  const handleSave = () => {
    const over = getAnesthetistsOverLimit(assignments, 2);
    if (over.length > 0) {
      setAlarm({ over, pending: assignments });
      return;
    }
    setStoredAnesthetistAssignments(assignments);
  };

  const handleConfirmAlarm = () => {
    if (alarm?.pending) {
      setStoredAnesthetistAssignments(alarm.pending);
      setAlarm(null);
    }
  };

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    getUsers().forEach((u) => m.set(u.id, u.name));
    return m;
  }, []);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-[var(--ribera-navy)]">Asignar anestesista a cada turno</h2>
      <p className="mb-4 text-sm text-gray-600">
        Asigne un anestesista a cada quirófano/turno. Debajo de cada turno se muestran los procedimientos programados en el calendario. Los turnos con algún <strong>paciente privado</strong> aparecen en naranja. Un anestesista puede estar en hasta dos recursos a la vez.
      </p>

      <div className="mb-4">
        <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="p-2 font-semibold text-gray-700">Recurso</th>
              {weekDays.map((d) => (
                <th key={d.toISOString()} colSpan={2} className="p-2 font-semibold text-gray-700">
                  {d.toLocaleDateString("es-ES", { weekday: "short" })} {d.getDate()}/{d.getMonth() + 1}
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="p-2 text-xs text-gray-500">—</th>
              {weekDays.map((d) => (
                <Fragment key={d.toISOString()}>
                  <th className="p-1 text-xs text-gray-500">Mañana</th>
                  <th className="p-1 text-xs text-gray-500">Tarde</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((res) => (
              <tr key={res.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="border-r border-gray-100 p-2 font-medium text-gray-700">{res.label}</td>
                {weekDays.map((d) => {
                  const dateStr = toISODate(d);
                  const morningSlot = getSlotProcedures(reservations, dateStr, "morning", res.id);
                  const afternoonSlot = getSlotProcedures(reservations, dateStr, "afternoon", res.id);
                  return (
                    <Fragment key={dateStr}>
                      <td className={`p-1 align-top ${morningSlot.hasPrivate ? "bg-orange-50 border-l-2 border-orange-400" : ""}`}>
                        <select
                          value={getAssignment(dateStr, "morning", res.id)}
                          onChange={(e) => setAssignment(dateStr, "morning", res.id, e.target.value)}
                          className="w-full min-w-[120px] rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {anestList.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                        {morningSlot.procedures.length > 0 && (
                          <div className="mt-1 text-[10px] text-gray-600 leading-tight">
                            {morningSlot.procedures.slice(0, 3).map((proc, i) => (
                              <div key={i} className="truncate" title={proc}>{proc}</div>
                            ))}
                            {morningSlot.procedures.length > 3 && (
                              <div className="text-gray-400">+{morningSlot.procedures.length - 3} más</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`p-1 align-top ${afternoonSlot.hasPrivate ? "bg-orange-50 border-l-2 border-orange-400" : ""}`}>
                        <select
                          value={getAssignment(dateStr, "afternoon", res.id)}
                          onChange={(e) => setAssignment(dateStr, "afternoon", res.id, e.target.value)}
                          className="w-full min-w-[120px] rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {anestList.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                        {afternoonSlot.procedures.length > 0 && (
                          <div className="mt-1 text-[10px] text-gray-600 leading-tight">
                            {afternoonSlot.procedures.slice(0, 3).map((proc, i) => (
                              <div key={i} className="truncate" title={proc}>{proc}</div>
                            ))}
                            {afternoonSlot.procedures.length > 3 && (
                              <div className="text-gray-400">+{afternoonSlot.procedures.length - 3} más</div>
                            )}
                          </div>
                        )}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        <span className="inline-block h-3 w-6 rounded border border-orange-300 bg-orange-50 align-middle" /> Turno con paciente privado (mismo dato que en el calendario).
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Guardar asignaciones
        </button>
      </div>

      {alarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-bold text-amber-900">Alarma: más de 2 recursos a la vez</h3>
            <p className="mb-4 text-sm text-amber-800">
              Los siguientes anestesistas están asignados a más de 2 recursos el mismo día y turno. ¿Desea confirmar esta decisión?
            </p>
            <ul className="mb-4 list-disc pl-4 text-sm text-amber-800">
              {alarm.over.map((o) => (
                <li key={`${o.date}-${o.shift}-${o.anesthetistId}`}>
                  {nameById.get(o.anesthetistId) ?? o.anesthetistId}: {o.count} recursos el {o.date} ({o.shift === "morning" ? "mañana" : "tarde"})
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmAlarm}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setAlarm(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
