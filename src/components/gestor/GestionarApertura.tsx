"use client";

/**
 * Vista gestor: plan de apertura del bloque quirúrgico.
 * - Ver día/turno/recurso
 * - Marcar OPEN / CLOSED / URGENT_RESERVED
 * - Definir umbral mínimo (minRequiredMinutes)
 * - Ver minutos programados
 * - Indicar "no justificable" cuando minutos < umbral
 */

import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { RESOURCES } from "@/lib/constants";
import { fetchBlockPlans, upsertBlockPlan } from "@/lib/api/blockOpeningPlan";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import { TRANSITION_MINUTES_PER_PROCEDURE } from "@/lib/constants";
import type { BlockOpeningPlan, Reservation, Shift } from "@/lib/types";

type PlanStatus = "OPEN" | "CLOSED" | "URGENT_RESERVED";

function getProgrammedMinutes(
  reservations: Reservation[],
  dateStr: string,
  resourceId: string,
  shift: Shift
): number {
  return reservations
    .filter(
      (r) =>
        r.date === dateStr &&
        r.resourceId === resourceId &&
        r.shift === shift &&
        r.status !== "cancelled"
    )
    .reduce((sum, r) => {
      const patientMinutes = (r.patients ?? []).reduce(
        (s, p) => s + (p.estimatedDurationMinutes || 0) + TRANSITION_MINUTES_PER_PROCEDURE,
        0
      );
      return sum + patientMinutes;
    }, 0);
}

function getPlanFor(
  plans: BlockOpeningPlan[],
  dateStr: string,
  resourceId: string,
  shift: Shift
): BlockOpeningPlan | undefined {
  return plans.find(
    (p) => p.date === dateStr && p.resourceId === resourceId && p.shift === shift
  );
}

interface GestionarAperturaProps {
  reservations: Reservation[];
}

export function GestionarApertura({ reservations }: GestionarAperturaProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [plans, setPlans] = useState<BlockOpeningPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minRequiredDefault = 180;

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekFrom = toISODate(weekDays[0]!);
  const weekTo = toISODate(weekDays[weekDays.length - 1]!);

  const refreshPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchBlockPlans({ dateFrom: weekFrom, dateTo: weekTo });
      setPlans(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar planes");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [weekFrom, weekTo]);

  useEffect(() => {
    refreshPlans();
  }, [refreshPlans]);

  const handleStatusChange = async (
    dateStr: string,
    resourceId: string,
    shift: Shift,
    status: PlanStatus,
    minRequiredMinutes: number,
    reservedUrgentMinutes: number
  ) => {
    const key = `${dateStr}-${resourceId}-${shift}`;
    setSaving(key);
    setError(null);
    try {
      const updated = await upsertBlockPlan({
        date: dateStr,
        resourceId,
        shift,
        status,
        minRequiredMinutes,
        reservedUrgentMinutes,
      });
      setPlans((prev) => {
        const rest = prev.filter((p) => !(p.date === dateStr && p.resourceId === resourceId && p.shift === shift));
        return [...rest, updated];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Cargando planes de apertura…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-[var(--ribera-navy)]">Plan de apertura del bloque</h2>
        <WeekNavigation
          weekStart={weekStart}
          onWeekChange={(d) => setWeekStart(d)}
        />
      </div>

      <p className="text-sm text-gray-600">
        OPEN: reservas permitidas · CLOSED: cerrado · URGENT_RESERVED: reservado para urgencias (no reservas normales).
        Si los minutos programados están por debajo del umbral, se marca como &quot;no justificable&quot;.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-100">
              <th className="border-r border-gray-200 p-2 font-semibold text-gray-700">Recurso</th>
              {weekDays.map((d) => (
                <th key={d.toISOString()} colSpan={2} className="border-r border-gray-200 p-2 text-center font-semibold text-gray-700">
                  {d.toLocaleDateString("es-ES", { weekday: "short" })} {d.getDate()}/{d.getMonth() + 1}
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="border-r border-gray-200 p-2 text-xs text-gray-500">—</th>
              {weekDays.map((d) => (
                <Fragment key={d.toISOString()}>
                  <th className="border-r border-gray-200 p-2 text-center text-xs text-amber-700">Mañana</th>
                  <th className="border-r border-gray-200 p-2 text-center text-xs text-slate-600">Tarde</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((res) => (
              <tr key={res.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="border-r border-gray-200 p-2 font-medium text-gray-800">{res.label}</td>
                {weekDays.map((d) => {
                  const dateStr = toISODate(d);
                  const morningMins = getProgrammedMinutes(reservations, dateStr, res.id, "morning");
                  const afternoonMins = getProgrammedMinutes(reservations, dateStr, res.id, "afternoon");
                  const morningPlan = getPlanFor(plans, dateStr, res.id, "morning");
                  const afternoonPlan = getPlanFor(plans, dateStr, res.id, "afternoon");
                  const morningStatus = (morningPlan?.status ?? "OPEN") as PlanStatus;
                  const afternoonStatus = (afternoonPlan?.status ?? "OPEN") as PlanStatus;
                  const morningMinReq = morningPlan?.minRequiredMinutes ?? minRequiredDefault;
                  const afternoonMinReq = afternoonPlan?.minRequiredMinutes ?? minRequiredDefault;
                  const morningNotJustified = morningMinReq > 0 && morningMins < morningMinReq && morningStatus === "OPEN";
                  const afternoonNotJustified = afternoonMinReq > 0 && afternoonMins < afternoonMinReq && afternoonStatus === "OPEN";

                  return (
                    <Fragment key={dateStr}>
                      <td className="border-r border-gray-100 p-2 align-top">
                        <Cell
                          programmedMinutes={morningMins}
                          status={morningStatus}
                          minRequired={morningMinReq}
                          notJustified={morningNotJustified}
                          saving={saving === `${dateStr}-${res.id}-morning`}
                          onStatusChange={(s) =>
                            handleStatusChange(
                              dateStr,
                              res.id,
                              "morning",
                              s,
                              morningPlan?.minRequiredMinutes ?? minRequiredDefault,
                              morningPlan?.reservedUrgentMinutes ?? 0
                            )
                          }
                          onMinRequiredChange={(v) =>
                            handleStatusChange(
                              dateStr,
                              res.id,
                              "morning",
                              morningStatus,
                              v,
                              morningPlan?.reservedUrgentMinutes ?? 0
                            )
                          }
                        />
                      </td>
                      <td className="border-r border-gray-100 p-2 align-top">
                        <Cell
                          programmedMinutes={afternoonMins}
                          status={afternoonStatus}
                          minRequired={afternoonMinReq}
                          notJustified={afternoonNotJustified}
                          saving={saving === `${dateStr}-${res.id}-afternoon`}
                          onStatusChange={(s) =>
                            handleStatusChange(
                              dateStr,
                              res.id,
                              "afternoon",
                              s,
                              afternoonPlan?.minRequiredMinutes ?? minRequiredDefault,
                              afternoonPlan?.reservedUrgentMinutes ?? 0
                            )
                          }
                          onMinRequiredChange={(v) =>
                            handleStatusChange(
                              dateStr,
                              res.id,
                              "afternoon",
                              afternoonStatus,
                              v,
                              afternoonPlan?.reservedUrgentMinutes ?? 0
                            )
                          }
                        />
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
  );
}

interface CellProps {
  programmedMinutes: number;
  status: PlanStatus;
  minRequired: number;
  notJustified: boolean;
  saving: boolean;
  onStatusChange: (s: PlanStatus) => void;
  onMinRequiredChange: (v: number) => void;
}

function Cell({ programmedMinutes, status, minRequired, notJustified, saving, onStatusChange, onMinRequiredChange }: CellProps) {
  return (
    <div className="space-y-1 rounded border border-gray-200 bg-white p-2">
      <p className="text-xs font-medium text-gray-600">
        {programmedMinutes} min programados
        {notJustified && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">No justificable</span>}
      </p>
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as PlanStatus)}
        disabled={saving}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="OPEN">OPEN</option>
        <option value="CLOSED">CLOSED</option>
        <option value="URGENT_RESERVED">URGENT</option>
      </select>
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-gray-500">Umbral min:</label>
        <input
          type="number"
          min={0}
          key={minRequired}
          defaultValue={minRequired}
          onBlur={(e) => {
            const v = parseInt(e.target.value || "0", 10);
            if (!Number.isNaN(v) && v >= 0 && v !== minRequired) onMinRequiredChange(v);
          }}
          disabled={saving}
          className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs"
        />
      </div>
    </div>
  );
}
