"use client";

/**
 * Pestaña del gestor: asignar anestesista a cada turno (recurso + fecha + mañana/tarde).
 * Enlazado con los pacientes programados en el calendario: se muestran los procedimientos
 * y los turnos con algún paciente privado aparecen en naranja.
 */

import { useState, useMemo, useEffect, Fragment } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { RESOURCES, PREANESTHESIA_MAX_PATIENTS } from "@/lib/constants";
import { getUsers } from "@/lib/dataHelpers";
import { hasAnesthetistAccess } from "@/lib/types";
import type { AnesthetistAssignment, AssignmentSlotType, ResourceId, Reservation, Shift } from "@/lib/types";
import {
  getStoredAnesthetistAssignments,
  setStoredAnesthetistAssignments,
  getAnesthetistsOverLimit,
} from "@/lib/storageAnesthetistAssignments";
import { getStoredReservations } from "@/lib/storageMensajesYNotificaciones";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";

function isMondayOrThursday(date: Date): boolean {
  const d = date.getDay();
  return d === 1 || d === 4;
}

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

  const getAssignment = (date: string, shift: Shift, slotType: AssignmentSlotType): string => {
    const a = assignments.find(
      (x) => x.date === date && x.shift === shift && x.slotType === slotType
    );
    return a?.anesthetistId ?? "";
  };

  const setAssignment = (date: string, shift: Shift, slotType: AssignmentSlotType, anesthetistId: string) => {
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
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Asignar anestesistas</h2>
      <p className="mb-4 text-sm text-gray-600">
        Asigne un anestesista a cada turno de quirófano y a la consulta de preanestesia (lun y jue, mañana). Los procedimientos programados se muestran bajo cada celda; los turnos con <strong>paciente privado</strong> van en naranja. Un anestesista puede estar en hasta dos recursos a la vez.
      </p>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--ribera-navy)]/20 bg-[var(--ribera-navy)]/5 px-4 py-3">
        <span className="font-medium text-[var(--ribera-navy)]">Semana laboral</span>
        <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      </div>

      {/* Quirófanos y recursos */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-800">
          <span className="inline-flex h-8 w-1 rounded-full bg-[var(--ribera-red)]" />
          Quirófanos y recursos
        </h3>
        <div className="overflow-x-auto rounded-xl border-2 border-gray-200">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-100">
                <th className="w-40 border-r-2 border-gray-300 p-3 font-semibold text-gray-700">Recurso</th>
                {weekDays.map((d, dayIndex) => (
                  <th key={d.toISOString()} colSpan={2} className={`p-2 text-center font-semibold text-gray-700 ${dayIndex === 0 ? "border-r-2 border-gray-300" : "border-r-2 border-l-2 border-gray-300"}`}>
                    {d.toLocaleDateString("es-ES", { weekday: "short" })} {d.getDate()}/{d.getMonth() + 1}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="border-r-2 border-gray-300 p-2 text-xs font-medium uppercase tracking-wider text-gray-500">—</th>
                {weekDays.map((d, dayIndex) => (
                  <Fragment key={d.toISOString()}>
                    <th className={`w-32 border-r-2 border-gray-300 p-2 text-center text-xs font-medium text-amber-800 ${dayIndex === 0 ? "" : "border-l-2"}`}>Mañana</th>
                    <th className={`w-32 p-2 text-center text-xs font-medium text-slate-600 ${dayIndex < weekDays.length - 1 ? "border-r-2 border-gray-300" : "border-r border-gray-200"}`}>Tarde</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((res) => (
                <tr key={res.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                  <td className="border-r-2 border-gray-300 bg-white p-2 font-medium text-gray-800">{res.label}</td>
                  {weekDays.map((d, dayIndex) => {
                    const dateStr = toISODate(d);
                    const morningSlot = getSlotProcedures(reservations, dateStr, "morning", res.id);
                    const afternoonSlot = getSlotProcedures(reservations, dateStr, "afternoon", res.id);
                    const daySep = dayIndex > 0 ? " border-l-2 border-gray-300" : "";
                    const daySepTarde = dayIndex < weekDays.length - 1 ? " border-r-2 border-gray-300" : "";
                    return (
                      <Fragment key={dateStr}>
                        <td className={`border-r border-gray-100 p-2 align-top${daySep} ${morningSlot.hasPrivate ? "bg-orange-50 border-l-4 border-l-orange-400" : ""}`}>
                          {morningSlot.procedures.length > 0 && (
                            <div className="mb-2 rounded bg-gray-100/80 px-1.5 py-1 text-[10px] text-gray-700 leading-tight">
                              {morningSlot.procedures.slice(0, 3).map((proc, i) => (
                                <div key={i} className="truncate" title={proc}>{proc}</div>
                              ))}
                              {morningSlot.procedures.length > 3 && (
                                <div className="text-gray-500">+{morningSlot.procedures.length - 3} más</div>
                              )}
                            </div>
                          )}
                          <select
                            value={getAssignment(dateStr, "morning", res.id)}
                            onChange={(e) => setAssignment(dateStr, "morning", res.id, e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-medium shadow-sm focus:border-[var(--ribera-red)] focus:ring-1 focus:ring-[var(--ribera-red)]"
                          >
                            <option value=""> </option>
                            {anestList.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className={`border-r border-gray-200 p-2 align-top${daySepTarde} ${afternoonSlot.hasPrivate ? "bg-orange-50 border-l-4 border-l-orange-400" : ""}`}>
                          {afternoonSlot.procedures.length > 0 && (
                            <div className="mb-2 rounded bg-gray-100/80 px-1.5 py-1 text-[10px] text-gray-700 leading-tight">
                              {afternoonSlot.procedures.slice(0, 3).map((proc, i) => (
                                <div key={i} className="truncate" title={proc}>{proc}</div>
                              ))}
                              {afternoonSlot.procedures.length > 3 && (
                                <div className="text-gray-500">+{afternoonSlot.procedures.length - 3} más</div>
                              )}
                            </div>
                          )}
                          <select
                            value={getAssignment(dateStr, "afternoon", res.id)}
                            onChange={(e) => setAssignment(dateStr, "afternoon", res.id, e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-medium shadow-sm focus:border-[var(--ribera-red)] focus:ring-1 focus:ring-[var(--ribera-red)]"
                          >
                            <option value=""> </option>
                            {anestList.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consulta de preanestesia: solo lunes y jueves por la mañana */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-sky-900">
          <span className="inline-flex h-8 w-1 rounded-full bg-sky-500" />
          Consulta de preanestesia
          <span className="text-xs font-normal text-sky-700">(lun y jue, mañana · máx {PREANESTHESIA_MAX_PATIENTS} pacientes)</span>
        </h3>
        <div className="overflow-x-auto rounded-xl border-2 border-sky-200 bg-sky-50/70">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-sky-200 bg-sky-100">
                <th className="w-40 border-r-2 border-sky-200 p-3 font-semibold text-sky-900">Recurso</th>
                {weekDays.map((d, dayIndex) => (
                  <th key={d.toISOString()} colSpan={2} className={`p-2 text-center font-semibold text-sky-900 ${dayIndex === 0 ? "border-r-2 border-sky-300" : "border-r-2 border-l-2 border-sky-300"}`}>
                    {d.toLocaleDateString("es-ES", { weekday: "short" })} {d.getDate()}/{d.getMonth() + 1}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-sky-200 bg-sky-50">
                <th className="border-r-2 border-sky-200 p-2 text-xs text-sky-800">—</th>
                {weekDays.map((d, dayIndex) => (
                  <Fragment key={d.toISOString()}>
                    <th className={`w-32 p-2 text-center text-xs font-medium text-sky-800 ${dayIndex === 0 ? "border-r border-sky-200" : "border-r border-l-2 border-sky-300"}`}>Mañana</th>
                    <th className={`w-32 p-2 text-center text-xs text-sky-600 ${dayIndex < weekDays.length - 1 ? "border-r-2 border-sky-300" : "border-r-2 border-sky-200"}`}>Tarde</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b-0">
                <td className="border-r-2 border-sky-200 bg-sky-100/80 p-3 font-medium text-sky-900">
                  Consulta preanestesia
                </td>
                {weekDays.map((d, dayIndex) => {
                  const dateStr = toISODate(d);
                  const showConsulta = isMondayOrThursday(d);
                  const daySep = dayIndex > 0 ? " border-l-2 border-sky-300" : "";
                  const daySepTarde = dayIndex < weekDays.length - 1 ? " border-r-2 border-sky-300" : "";
                  return (
                    <Fragment key={dateStr}>
                      <td className={`border-r border-sky-100 p-2 align-top${daySep}`}>
                        {showConsulta ? (
                          <select
                            value={getAssignment(dateStr, "morning", "consulta-preanestesia")}
                            onChange={(e) => setAssignment(dateStr, "morning", "consulta-preanestesia", e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border-2 border-sky-300 bg-white px-2 py-2 text-xs font-medium text-sky-900 shadow-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                          >
                            <option value=""> </option>
                            {anestList.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="block py-2 text-center text-xs text-sky-500/80">—</span>
                        )}
                      </td>
                      <td className={`border-r-2 border-sky-200 p-2${daySepTarde}`}>
                        <span className="block py-2 text-center text-xs text-sky-500/80">—</span>
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-block h-4 w-6 rounded border-2 border-orange-300 bg-orange-50 align-middle" />
        Turno con paciente privado (mismo dato que en el calendario).
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
