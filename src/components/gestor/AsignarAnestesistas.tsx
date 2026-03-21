"use client";

/**
 * Pestaña del gestor: asignar anestesista a cada turno (recurso + fecha + mañana/tarde).
 * Enlazado con los pacientes programados en el calendario: se muestran los procedimientos
 * y los turnos con algún paciente privado aparecen en naranja.
 */

import { useState, useMemo, useEffect, Fragment } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { RESOURCES, PREANESTHESIA_MAX_PATIENTS } from "@/lib/constants";
import { useUsers } from "@/context/UsersContext";
import { hasAnesthetistAccess } from "@/lib/types";
import type { AnesthetistAssignment, ResourceId, Reservation, Shift } from "@/lib/types";
import { ASSIGNMENT_FULL_SHIFT, ASSIGNMENT_PREANESTHESIA } from "@/lib/types";
import { getAnesthetistsOverLimit } from "@/lib/storageAnesthetistAssignments";
import { getAssignments, saveAssignments } from "@/lib/anesthetistAssignments";
import { isUnavailable as isAnesthetistUnavailable } from "@/lib/storageAnesthetistUnavailability";
import { getStoredReservations } from "@/lib/storageMensajesYNotificaciones";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";

function isMondayOrThursday(date: Date): boolean {
  const d = date.getDay();
  return d === 1 || d === 4;
}

/** Info de cada paciente en un turno: NHC, procedimiento, cirujano */
export interface SlotPatientInfo {
  nhc: string;
  procedure: string;
  surgeonName: string;
}

/** Pacientes programados en un turno (recurso + fecha + mañana/tarde) con NHC, procedimiento, cirujano */
function getSlotPatientInfo(
  reservations: Reservation[],
  dateStr: string,
  shift: Shift,
  resourceId: ResourceId,
  users: { id: string; name: string }[]
): { patientInfo: SlotPatientInfo[]; hasPrivate: boolean; hasSespa: boolean } {
  const patientInfo: SlotPatientInfo[] = [];
  let hasPrivate = false;
  let hasSespa = false;
  reservations
    .filter((r) => r.date === dateStr && r.shift === shift && r.resourceId === resourceId && r.patients?.length)
    .forEach((r) => {
      const surgeonName = users.find((u) => u.id === r.surgeonId)?.name ?? "—";
      r.patients.forEach((p) => {
        patientInfo.push({
          nhc: p.numeroHistoria || "—",
          procedure: p.procedure || "—",
          surgeonName,
        });
        if (isPrivateFunding(p.entidadFinanciadora)) hasPrivate = true;
        if (isSespa(p.entidadFinanciadora)) hasSespa = true;
      });
    });
  return { patientInfo, hasPrivate, hasSespa };
}


/** Recursos OR que cuentan para el límite de 2 por turno. __full_shift__ cuenta como 1. */
const RESOURCES_FOR_LIMIT = new Set<string>(["Q1", "Q2", "Q3", "procedimientos-menores", "tecnicas-dolor", ASSIGNMENT_FULL_SHIFT]);

/** Indica si un slot tiene pacientes SESPA (para recurso, full_shift o consulta). Consulta preanestesia: no aplica. */
function slotHasSespa(
  reservations: Reservation[],
  dateStr: string,
  shift: Shift,
  slotKey: SlotKey,
  users: { id: string; name: string }[]
): boolean {
  if (slotKey === "consulta-preanestesia") return false;
  if (slotKey === ASSIGNMENT_FULL_SHIFT) {
    return RESOURCES.some((r) => getSlotPatientInfo(reservations, dateStr, shift, r.id as ResourceId, users).hasSespa);
  }
  return getSlotPatientInfo(reservations, dateStr, shift, slotKey as ResourceId, users).hasSespa;
}

/** Cuenta asignaciones OR por anestesista en un (date, shift) */
function getAnesthetistCountForSlot(
  assignments: AnesthetistAssignment[],
  date: string,
  shift: Shift
): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of assignments) {
    if (a.assignmentType !== "OR" || !RESOURCES_FOR_LIMIT.has(a.resourceId)) continue;
    if (a.date !== date || a.shift !== shift) continue;
    m.set(a.anesthetistId, (m.get(a.anesthetistId) ?? 0) + 1);
  }
  return m;
}

/** Identificador de slot en UI: recurso o "consulta-preanestesia" o "__full_shift__" */
type SlotKey = ResourceId | "consulta-preanestesia" | typeof ASSIGNMENT_FULL_SHIFT;

function assignmentMatchesSlot(a: AnesthetistAssignment, slotKey: SlotKey): boolean {
  if (slotKey === "consulta-preanestesia") return a.assignmentType === "PREANESTHESIA" && a.resourceId === ASSIGNMENT_PREANESTHESIA;
  return a.assignmentType === "OR" && a.resourceId === slotKey;
}

export interface AnesthetistSuggestion {
  id: string;
  name: string;
  available: boolean;
  disabled?: boolean;
  reason?: string;
}

/** Anestesistas ordenados: primero disponibles, luego otros. Si hasSespa, solo canSespa=true son válidos. */
function getSuggestedAnesthetists(
  dateStr: string,
  shift: Shift,
  slotKey: SlotKey,
  assignments: AnesthetistAssignment[],
  anestList: { id: string; name: string; canSespa?: boolean }[],
  hasSespa: boolean
): AnesthetistSuggestion[] {
  const countMap = getAnesthetistCountForSlot(assignments, dateStr, shift);
  const result: AnesthetistSuggestion[] = anestList.map((u) => {
    const isUnav = isAnesthetistUnavailable(u.id, dateStr, shift);
    const count = countMap.get(u.id) ?? 0;
    const isOverLimit = RESOURCES_FOR_LIMIT.has(slotKey) && count >= 2;
    const needsSespa = hasSespa && !(u.canSespa === true);
    const available = !isUnav && !isOverLimit && !needsSespa;
    const disabled = needsSespa;
    let reason: string | undefined;
    if (isUnav) reason = "No disponibilidad solicitada";
    else if (isOverLimit) reason = "Ya tiene 2 recursos en este turno";
    else if (needsSespa) reason = "No habilitado para SESPA";
    return { id: u.id, name: u.name, available, disabled, reason };
  });
  return result.sort((a, b) => {
    if (a.available && !b.available) return -1;
    if (!a.available && b.available) return 1;
    return a.name.localeCompare(b.name);
  });
}

interface AsignarAnestesistasProps {
  /** Reservas del calendario (pacientes programados); si no se pasan, se leen de localStorage */
  reservations?: Reservation[];
}

export function AsignarAnestesistas({ reservations: propReservations }: AsignarAnestesistasProps = {}) {
  const { users } = useUsers();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [assignments, setAssignments] = useState<AnesthetistAssignment[]>([]);
  const [alarm, setAlarm] = useState<{ over: { date: string; shift: Shift; anesthetistId: string; count: number }[]; pending: AnesthetistAssignment[] } | null>(null);
  const [unavConfirm, setUnavConfirm] = useState<{ dateStr: string; shift: Shift; slotKey: SlotKey; anesthetistId: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [sespaError, setSespaError] = useState("");

  const reservations = useMemo(
    () => propReservations ?? getStoredReservations(),
    [propReservations]
  );

  useEffect(() => {
    getAssignments()
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }, []);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const anestList = useMemo(
    () => users.filter((u) => hasAnesthetistAccess(u.role)),
    [users]
  );

  const getAssignment = (date: string, shift: Shift, slotKey: SlotKey): string => {
    const a = assignments.find((x) => assignmentMatchesSlot(x, slotKey) && x.date === date && x.shift === shift);
    return a?.anesthetistId ?? "";
  };

  const applyAssignment = (date: string, shift: Shift, slotKey: SlotKey, anesthetistId: string) => {
    const assignmentType = slotKey === "consulta-preanestesia" ? "PREANESTHESIA" as const : "OR" as const;
    const resourceId = slotKey === "consulta-preanestesia" ? ASSIGNMENT_PREANESTHESIA : slotKey;
    const list = [...assignments];
    const existing = list.find((x) => assignmentMatchesSlot(x, slotKey) && x.date === date && x.shift === shift);
    const removePred = (a: AnesthetistAssignment) =>
      a.date === date && a.shift === shift && a.assignmentType === assignmentType && a.resourceId === resourceId;
    if (!anesthetistId) {
      setAssignments(list.filter((a) => !removePred(a)));
      return;
    }
    const newOne: AnesthetistAssignment = {
      id: existing?.id ?? `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      shift,
      assignmentType,
      resourceId,
      anesthetistId,
    };
    const next = existing ? list.map((a) => (a.id === existing.id ? newOne : a)) : [...list.filter((a) => !removePred(a)), newOne];
    setAssignments(next);
  };

  const handleAssignmentChange = (dateStr: string, shift: Shift, slotKey: SlotKey, anesthetistId: string) => {
    if (!anesthetistId) {
      applyAssignment(dateStr, shift, slotKey, "");
      return;
    }
    const hasSespa = slotHasSespa(reservations, dateStr, shift, slotKey, users);
    const anest = anestList.find((a) => a.id === anesthetistId);
    if (hasSespa && anest && !(anest.canSespa === true)) {
      setSespaError("Este bloque contiene pacientes SESPA; solo pueden asignarse anestesistas habilitados para SESPA.");
      return;
    }
    if (isAnesthetistUnavailable(anesthetistId, dateStr, shift)) {
      setUnavConfirm({ dateStr, shift, slotKey, anesthetistId });
      return;
    }
    setSespaError("");
    applyAssignment(dateStr, shift, slotKey, anesthetistId);
  };

  const SESPA_ERROR_MSG = "Este bloque contiene pacientes SESPA; solo pueden asignarse anestesistas habilitados para SESPA.";

  const validateSespaBeforeSave = (list: AnesthetistAssignment[] = assignments): boolean => {
    for (const a of list) {
      if (a.assignmentType !== "OR") continue;
      const hasSespa = slotHasSespa(reservations, a.date, a.shift, a.resourceId as SlotKey, users);
      if (!hasSespa) continue;
      const anest = anestList.find((u) => u.id === a.anesthetistId);
      if (!anest || !(anest.canSespa === true)) {
        setSaveError(SESPA_ERROR_MSG);
        return false;
      }
    }
    setSaveError("");
    return true;
  };

  const handleSave = async () => {
    setSaveError("");
    const over = getAnesthetistsOverLimit(assignments, 2);
    if (over.length > 0) {
      setAlarm({ over, pending: assignments });
      return;
    }
    if (!validateSespaBeforeSave()) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveAssignments(assignments);
      setSaveSuccess(true);
      setSaveError("");
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar asignaciones";
      setSaveError(msg);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAlarm = async () => {
    if (alarm?.pending) {
      setSaveError("");
      if (!validateSespaBeforeSave(alarm.pending)) return;
      setSaving(true);
      try {
        await saveAssignments(alarm.pending);
        setAssignments(alarm.pending);
        setSaveSuccess(true);
        setSaveError("");
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al guardar asignaciones";
        setSaveError(msg);
        console.error(err);
      } finally {
        setSaving(false);
      }
      setAlarm(null);
    }
  };

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Asignar anestesistas</h2>
      <p className="mb-4 text-sm text-gray-600">
        Asigne un anestesista a cada turno. Procedimientos bajo cada celda; turnos con paciente privado en naranja. Máx. 2 recursos por anestesista a la vez.
      </p>
      {anestList.length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          No hay anestesistas en el sistema. Añada usuarios con perfil anestesista o gestor-anestesista para poder asignarlos.
        </p>
      )}

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
                    const morningSlot = getSlotPatientInfo(reservations, dateStr, "morning", res.id, users);
                    const afternoonSlot = getSlotPatientInfo(reservations, dateStr, "afternoon", res.id, users);
                    const daySep = dayIndex > 0 ? " border-l-2 border-gray-300" : "";
                    const daySepTarde = dayIndex < weekDays.length - 1 ? " border-r-2 border-gray-300" : "";
                    return (
                      <Fragment key={dateStr}>
                        <td className={`border-r border-gray-100 p-2 align-top${daySep} ${morningSlot.hasPrivate ? "bg-orange-50 border-l-4 border-l-orange-400" : ""} ${morningSlot.hasSespa ? "border-l-4 border-l-rose-400 bg-rose-50/50" : ""}`}>
                          {morningSlot.hasSespa && (
                            <p className="mb-1 text-[10px] text-rose-700 font-medium">Este bloque contiene pacientes SESPA</p>
                          )}
                          {morningSlot.patientInfo.length > 0 && (
                            <div className="mb-2 space-y-1 rounded bg-gray-100/80 px-1.5 py-1 text-[10px] text-gray-700 leading-tight">
                              {morningSlot.patientInfo.slice(0, 3).map((p, i) => (
                                <div key={i} className="truncate" title={`${p.nhc} · ${p.procedure} · ${p.surgeonName}`}>
                                  <span className="font-medium">{p.nhc}</span> · {p.procedure} · <span className="text-gray-600">{p.surgeonName}</span>
                                </div>
                              ))}
                              {morningSlot.patientInfo.length > 3 && (
                                <div className="text-gray-500">+{morningSlot.patientInfo.length - 3} más</div>
                              )}
                            </div>
                          )}
                          <select
                            value={getAssignment(dateStr, "morning", res.id as SlotKey)}
                            onChange={(e) => handleAssignmentChange(dateStr, "morning", res.id as SlotKey, e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-medium shadow-sm focus:border-[var(--ribera-red)] focus:ring-1 focus:ring-[var(--ribera-red)]"
                            title="Sugerencias: disponibles primero (sin no-disponibilidad, bajo límite)"
                          >
                            <option value=""> </option>
                            {(() => {
                              const hasSespa = morningSlot.hasSespa;
                              const suggested = getSuggestedAnesthetists(dateStr, "morning", res.id as SlotKey, assignments, anestList, hasSespa);
                              const available = suggested.filter((s) => s.available);
                              const others = suggested.filter((s) => !s.available);
                              return (
                                <>
                                  {available.length > 0 && (
                                    <optgroup label="Sugeridos (disponibles)">
                                      {available.map((u) => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {others.length > 0 && (
                                    <optgroup label="Otros">
                                      {others.map((u) => (
                                        <option key={u.id} value={u.id} disabled={u.disabled} title={u.reason}>
                                          {u.name}{u.reason ? ` (${u.reason})` : ""}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              );
                            })()}
                          </select>
                        </td>
                        <td className={`border-r border-gray-200 p-2 align-top${daySepTarde} ${afternoonSlot.hasPrivate ? "bg-orange-50 border-l-4 border-l-orange-400" : ""} ${afternoonSlot.hasSespa ? "border-l-4 border-l-rose-400 bg-rose-50/50" : ""}`}>
                          {afternoonSlot.hasSespa && (
                            <p className="mb-1 text-[10px] text-rose-700 font-medium">Este bloque contiene pacientes SESPA</p>
                          )}
                          {afternoonSlot.patientInfo.length > 0 && (
                            <div className="mb-2 space-y-1 rounded bg-gray-100/80 px-1.5 py-1 text-[10px] text-gray-700 leading-tight">
                              {afternoonSlot.patientInfo.slice(0, 3).map((p, i) => (
                                <div key={i} className="truncate" title={`${p.nhc} · ${p.procedure} · ${p.surgeonName}`}>
                                  <span className="font-medium">{p.nhc}</span> · {p.procedure} · <span className="text-gray-600">{p.surgeonName}</span>
                                </div>
                              ))}
                              {afternoonSlot.patientInfo.length > 3 && (
                                <div className="text-gray-500">+{afternoonSlot.patientInfo.length - 3} más</div>
                              )}
                            </div>
                          )}
                          <select
                            value={getAssignment(dateStr, "afternoon", res.id as SlotKey)}
                            onChange={(e) => handleAssignmentChange(dateStr, "afternoon", res.id as SlotKey, e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-medium shadow-sm focus:border-[var(--ribera-red)] focus:ring-1 focus:ring-[var(--ribera-red)]"
                            title="Sugerencias: disponibles primero (sin no-disponibilidad, bajo límite)"
                          >
                            <option value=""> </option>
                            {(() => {
                              const hasSespa = afternoonSlot.hasSespa;
                              const suggested = getSuggestedAnesthetists(dateStr, "afternoon", res.id as SlotKey, assignments, anestList, hasSespa);
                              const available = suggested.filter((s) => s.available);
                              const others = suggested.filter((s) => !s.available);
                              return (
                                <>
                                  {available.length > 0 && (
                                    <optgroup label="Sugeridos (disponibles)">
                                      {available.map((u) => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {others.length > 0 && (
                                    <optgroup label="Otros">
                                      {others.map((u) => (
                                        <option key={u.id} value={u.id} disabled={u.disabled} title={u.reason}>
                                          {u.name}{u.reason ? ` (${u.reason})` : ""}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              );
                            })()}
                          </select>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-b-2 border-amber-200 bg-amber-50/50">
                <td className="border-r-2 border-gray-300 p-2 font-semibold text-amber-900">Turno completo</td>
                {weekDays.map((d, dayIndex) => {
                  const dateStr = toISODate(d);
                  const daySep = dayIndex > 0 ? " border-l-2 border-gray-300" : "";
                  const daySepTarde = dayIndex < weekDays.length - 1 ? " border-r-2 border-gray-300" : "";
                  const fullShiftHasSespaM = slotHasSespa(reservations, dateStr, "morning", ASSIGNMENT_FULL_SHIFT, users);
                  const fullShiftHasSespaA = slotHasSespa(reservations, dateStr, "afternoon", ASSIGNMENT_FULL_SHIFT, users);
                  return (
                    <Fragment key={dateStr}>
                      <td className={`border-r border-amber-100 p-2 align-top${daySep} ${fullShiftHasSespaM ? "border-l-4 border-l-rose-400 bg-rose-50/30" : ""}`}>
                        {fullShiftHasSespaM && <p className="mb-1 text-[10px] text-rose-700 font-medium">Turno con SESPA</p>}
                        <select
                          value={getAssignment(dateStr, "morning", ASSIGNMENT_FULL_SHIFT)}
                          onChange={(e) => handleAssignmentChange(dateStr, "morning", ASSIGNMENT_FULL_SHIFT, e.target.value)}
                          className="w-full min-w-[110px] rounded-lg border-2 border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        >
                          <option value=""> </option>
                          {(() => {
                            const suggested = getSuggestedAnesthetists(dateStr, "morning", ASSIGNMENT_FULL_SHIFT, assignments, anestList, fullShiftHasSespaM);
                            const available = suggested.filter((s) => s.available);
                            const others = suggested.filter((s) => !s.available);
                            return (
                              <>
                                {available.length > 0 && (
                                  <optgroup label="Sugeridos">
                                    {available.map((u) => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                                {others.length > 0 && (
                                  <optgroup label="Otros">
                                    {others.map((u) => (
                                      <option key={u.id} value={u.id} disabled={u.disabled} title={u.reason}>
                                        {u.name}{u.reason ? ` (${u.reason})` : ""}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                      </td>
                      <td className={`border-r border-amber-200 p-2 align-top${daySepTarde} ${fullShiftHasSespaA ? "border-l-4 border-l-rose-400 bg-rose-50/30" : ""}`}>
                        {fullShiftHasSespaA && <p className="mb-1 text-[10px] text-rose-700 font-medium">Turno con SESPA</p>}
                        <select
                          value={getAssignment(dateStr, "afternoon", ASSIGNMENT_FULL_SHIFT)}
                          onChange={(e) => handleAssignmentChange(dateStr, "afternoon", ASSIGNMENT_FULL_SHIFT, e.target.value)}
                          className="w-full min-w-[110px] rounded-lg border-2 border-amber-300 bg-white px-2 py-2 text-xs font-medium text-amber-900 shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        >
                          <option value=""> </option>
                          {(() => {
                            const suggested = getSuggestedAnesthetists(dateStr, "afternoon", ASSIGNMENT_FULL_SHIFT, assignments, anestList, fullShiftHasSespaA);
                            const available = suggested.filter((s) => s.available);
                            const others = suggested.filter((s) => !s.available);
                            return (
                              <>
                                {available.length > 0 && (
                                  <optgroup label="Sugeridos">
                                    {available.map((u) => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                                {others.length > 0 && (
                                  <optgroup label="Otros">
                                    {others.map((u) => (
                                      <option key={u.id} value={u.id} disabled={u.disabled} title={u.reason}>
                                        {u.name}{u.reason ? ` (${u.reason})` : ""}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
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
                            value={getAssignment(dateStr, "morning", "consulta-preanestesia" as SlotKey)}
                            onChange={(e) => handleAssignmentChange(dateStr, "morning", "consulta-preanestesia" as SlotKey, e.target.value)}
                            className="w-full min-w-[110px] rounded-lg border-2 border-sky-300 bg-white px-2 py-2 text-xs font-medium text-sky-900 shadow-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                            title="Sugerencias: disponibles primero (sin no-disponibilidad)"
                          >
                            <option value=""> </option>
                            {(() => {
                              const suggested = getSuggestedAnesthetists(dateStr, "morning", "consulta-preanestesia" as SlotKey, assignments, anestList, false);
                              const available = suggested.filter((s) => s.available);
                              const others = suggested.filter((s) => !s.available);
                              return (
                                <>
                                  {available.length > 0 && (
                                    <optgroup label="Sugeridos (disponibles)">
                                      {available.map((u) => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {others.length > 0 && (
                                    <optgroup label="Otros">
                                      {others.map((u) => (
                                        <option key={u.id} value={u.id} disabled={u.disabled} title={u.reason}>
                                          {u.name}{u.reason ? ` (${u.reason})` : ""}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              );
                            })()}
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

      <div className="mb-4 flex flex-col gap-1 text-xs text-gray-500">
        <p className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 rounded border-2 border-orange-300 bg-orange-50 align-middle" />
          Turno con paciente privado (mismo dato que en el calendario).
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 rounded border-2 border-rose-300 bg-rose-50 align-middle" />
          Este bloque contiene pacientes SESPA; solo pueden asignarse anestesistas habilitados para SESPA.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || anestList.length === 0}
          className="rounded-lg bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar asignaciones"}
        </button>
        {saveSuccess && (
          <span className="text-sm font-medium text-green-700">Asignaciones guardadas correctamente.</span>
        )}
        {(saveError || sespaError) && (
          <p className="text-sm font-medium text-rose-700" role="alert">
            {saveError || sespaError}
          </p>
        )}
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

      {unavConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-bold text-amber-900">No disponibilidad solicitada</h3>
            <p className="mb-4 text-sm text-amber-800">
              <strong>{nameById.get(unavConfirm.anesthetistId) ?? unavConfirm.anesthetistId}</strong> ha solicitado no disponibilidad para el día <strong>{unavConfirm.dateStr}</strong> ({unavConfirm.shift === "morning" ? "mañana" : "tarde"}). ¿Desea asignarlo igualmente?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  applyAssignment(unavConfirm.dateStr, unavConfirm.shift, unavConfirm.slotKey, unavConfirm.anesthetistId);
                  setUnavConfirm(null);
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setUnavConfirm(null)}
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
