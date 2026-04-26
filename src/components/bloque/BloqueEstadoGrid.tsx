"use client";

/**
 * Cuadrícula estado del bloque: columnas = días, filas = rangos horarios.
 * Verde = libre, Rojo = ocupado por otro, Amarillo = reservado (por mí / gestor ve nombre), Blanco = datos de pacientes.
 */

import { useMemo } from "react";
import { getWeekDays, getSlots, toISODate } from "@/lib/utils";
import type { Reservation, ResourceId, Shift } from "@/lib/types";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import { FundingBadge } from "@/components/ui/StatusBadge";

export type CellState = "free" | "occupied-other" | "reserved-mine" | "programmed-mine";

export interface CellInfo {
  date: string;
  resourceId: ResourceId;
  shift: Shift;
  slotIndex: number;
  state: CellState;
  reservation?: Reservation;
  surgeonName?: string;
}

function slotKey(date: string, resourceId: string, shift: string, slotIndex: number) {
  return `${date}__${resourceId}__${shift}__${slotIndex}`;
}

interface BloqueEstadoGridProps {
  weekStart: Date;
  resourceId: ResourceId;
  resourceLabel: string;
  reservations: Reservation[];
  currentUserId: string | null;
  surgeonNames: Map<string, string>;
  viewAs: "cirujano" | "gestor";
  selectedKeys: Set<string>;
  onCellClick?: (cell: CellInfo) => void;
}

export function BloqueEstadoGrid({
  weekStart,
  resourceId,
  resourceLabel,
  reservations,
  currentUserId,
  surgeonNames,
  viewAs,
  selectedKeys,
  onCellClick,
}: BloqueEstadoGridProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const morningSlots = getSlots("morning");
  const afternoonSlots = getSlots("afternoon");

  const getCellInfo = useMemo(() => {
    const resMap = new Map<string, Reservation>();
    reservations.forEach((r) => {
      if (r.resourceId !== resourceId || r.status === "cancelled") return;
      resMap.set(slotKey(r.date, r.resourceId, r.shift, r.slotIndex), r);
    });
    return (dateStr: string, shift: Shift, slotIndex: number): CellInfo => {
      const key = slotKey(dateStr, resourceId, shift, slotIndex);
      const res = resMap.get(key);
      if (!res) {
        return { date: dateStr, resourceId, shift, slotIndex, state: "free" };
      }
      const isMine = currentUserId && res.surgeonId === currentUserId;
      const hasPatients = res.patients.length > 0;
      if (viewAs === "gestor") {
        return {
          date: dateStr,
          resourceId,
          shift,
          slotIndex,
          state: hasPatients ? "programmed-mine" : "reserved-mine",
          reservation: res,
          surgeonName: surgeonNames.get(res.surgeonId),
        };
      }
      if (isMine && hasPatients) return { date: dateStr, resourceId, shift, slotIndex, state: "programmed-mine", reservation: res };
      if (isMine) return { date: dateStr, resourceId, shift, slotIndex, state: "reserved-mine", reservation: res };
      return { date: dateStr, resourceId, shift, slotIndex, state: "occupied-other", reservation: res };
    };
  }, [weekStart, resourceId, reservations, currentUserId, viewAs, surgeonNames]);

  const rows = useMemo(() => {
    const r: { shift: Shift; slotIndex: number; label: string }[] = [];
    morningSlots.forEach((s, i) => r.push({ shift: "morning", slotIndex: i, label: `${s.start}-${s.end} Mañana` }));
    afternoonSlots.forEach((s, i) => r.push({ shift: "afternoon", slotIndex: i, label: `${s.start}-${s.end} Tarde` }));
    return r;
  }, [morningSlots, afternoonSlots]);

  const cellClass = (state: CellState, selected: boolean, hasPrivatePatient?: boolean, hasSespaPatient?: boolean) => {
    const base = "min-h-[44px] border p-1 text-xs transition " + (selected ? "ring-2 ring-[var(--ribera-red)] ring-offset-1 " : "");
    switch (state) {
      case "free":
        return base + "bg-emerald-100 border-emerald-300 hover:bg-emerald-200 cursor-pointer";
      case "occupied-other":
        return base + "bg-red-100 border-red-300 cursor-default";
      case "reserved-mine":
        return base + "bg-amber-200 border-amber-400 cursor-pointer";
      case "programmed-mine":
        return base + (hasPrivatePatient ? "bg-orange-100 border-orange-400 " : hasSespaPatient ? "bg-rose-50 border-rose-300 " : "bg-white border-gray-300 ") + "cursor-pointer";
      default:
        return base + "bg-gray-100";
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[500px] border-collapse text-left">
        <caption className="border-b border-gray-200 bg-ribera-gray-light px-3 py-2 text-left font-semibold text-gray-800">
          {resourceLabel}
        </caption>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="w-32 border-r border-gray-200 p-2 text-sm font-semibold text-gray-700">Horario</th>
            {weekDays.map((d) => (
              <th key={d.toISOString()} className="p-2 text-sm font-semibold text-gray-700">
                {d.toLocaleDateString("es-ES", { weekday: "short" })}
                <br />
                <span className="text-xs font-normal">{d.getDate()}/{d.getMonth() + 1}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ shift, slotIndex, label }) => (
            <tr key={`${shift}-${slotIndex}`} className="border-b border-gray-100">
              <td className="whitespace-nowrap border-r border-gray-100 p-2 text-sm font-medium text-gray-700">{label}</td>
              {weekDays.map((d) => {
                const dateStr = toISODate(d);
                const info = getCellInfo(dateStr, shift, slotIndex);
                const key = slotKey(dateStr, resourceId, shift, slotIndex);
                const selected = selectedKeys.has(key);
                const hasPrivatePatient = viewAs === "gestor" && info.reservation?.patients?.some((p) => isPrivateFunding(p.entidadFinanciadora));
                const hasSespaPatient = viewAs === "gestor" && info.reservation?.patients?.some((p) => isSespa(p.entidadFinanciadora));
                const clickable = viewAs === "cirujano" && (info.state === "free" || info.state === "reserved-mine" || info.state === "programmed-mine");
                return (
                  <td
                    key={dateStr}
                    className={cellClass(info.state, selected, hasPrivatePatient, hasSespaPatient)}
                    onClick={clickable ? () => onCellClick?.(info) : undefined}
                    role={clickable ? "button" : undefined}
                  >
                    {info.state === "free" && "Libre"}
                    {info.state === "occupied-other" && "Ocupado"}
                    {info.state === "reserved-mine" && (viewAs === "gestor" && info.surgeonName ? info.surgeonName : "Reservado")}
                    {info.state === "programmed-mine" && info.reservation?.patients && (
                      <div className="space-y-0.5">
                        {hasSespaPatient && (
                          <span className="mr-1 inline-block"><FundingBadge type="sespa" /></span>
                        )}
                        {info.reservation.patients.map((p) => (
                          <div key={p.id} className="text-gray-800">
                            <span className="font-medium">{p.numeroHistoria}</span> {p.procedure} ({p.estimatedDurationMinutes}+10 min)
                            {isSespa(p.entidadFinanciadora) && <span className="ml-1 text-[9px] font-semibold text-rose-700">SESPA</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
