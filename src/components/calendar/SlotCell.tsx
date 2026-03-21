"use client";

/**
 * Celda de un hueco en el calendario: libre (verde), reservado por el usuario (ámbar) u ocupado (rojo).
 * El cirujano puede pulsar en reservado para programar pacientes y en ocupado (suyo) para ver/editar sus pacientes.
 */

import type { SlotView } from "@/lib/types";

interface SlotCellProps {
  slot: SlotView;
  /** Título del tramo horario, p. ej. "08:00-09:30" */
  timeLabel?: string;
  showDetails?: boolean;
  onSelect?: (slot: SlotView) => void;
  disabled?: boolean;
  compact?: boolean;
  selected?: boolean;
  assignedToMe?: boolean;
}

export function SlotCell({
  slot,
  timeLabel,
  showDetails = false,
  onSelect,
  disabled = false,
  compact = false,
  selected = false,
  assignedToMe = false,
}: SlotCellProps) {
  const isFree = slot.status === "free";
  const isReserved = slot.status === "reserved";
  const isOccupied = slot.status === "occupied";
  const isMyOccupied = isOccupied && slot.isMyReservation;
  const hasPrivate = !!slot.hasPrivate;
  const hasSespa = !!slot.hasSespa;
  const clickable =
    onSelect &&
    !disabled &&
    (isFree || isReserved || isMyOccupied);
  const styleClass = hasPrivate
    ? "slot-private"
    : isFree
      ? "slot-free hover:bg-emerald-200"
      : isReserved
        ? "slot-reserved hover:bg-amber-200"
        : hasSespa
          ? "slot-sespa"
          : "slot-occupied";

  const tooltipParts: string[] = [];
  if (slot.surgeonName) tooltipParts.push(`Cirujano: ${slot.surgeonName}`);
  if (slot.patientNames?.length) tooltipParts.push("Pacientes:", ...slot.patientNames);
  if (hasSespa) tooltipParts.push("Este bloque contiene pacientes SESPA");
  if (hasPrivate) tooltipParts.push("Incluye financiación privada");
  const tooltipTitle = tooltipParts.length > 0 ? tooltipParts.join("\n") : undefined;

  return (
    <div
      role={clickable ? "button" : undefined}
      onClick={clickable ? () => onSelect?.(slot) : undefined}
      title={tooltipTitle}
      className={`
        rounded border text-center transition
        ${styleClass}
        ${clickable ? "cursor-pointer" : ""}
        ${disabled ? "cursor-not-allowed opacity-60" : ""}
        ${compact ? "p-1 text-xs" : "p-2 text-sm"}
        ${selected ? "ring-2 ring-offset-1 ring-[var(--ribera-red)]" : ""}
        ${assignedToMe ? "ring-2 ring-amber-500 ring-offset-1 border-amber-300 bg-amber-50/80" : ""}
      `}
    >
      {timeLabel && (
        <div className="mb-1 border-b border-current/20 pb-1 text-xs font-semibold opacity-90">
          {timeLabel}
        </div>
      )}
      {isFree && <span className="font-medium text-emerald-800">Libre</span>}
      {isReserved && (
        <span className="font-medium text-amber-800" title="Su reserva. Pulse para programar pacientes.">
          Reservado
        </span>
      )}
      {isOccupied && (
        <>
          <span className={`font-medium ${isMyOccupied ? "text-red-800" : "text-red-800"}`}>
            {isMyOccupied ? "Sus pacientes" : "Ocupado"}
          </span>
          {hasSespa && (
            <span className="ml-1 inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-rose-200 text-rose-800 border border-rose-300" title="Este bloque contiene pacientes SESPA">SESPA</span>
          )}
          {isMyOccupied && (
            <span className="block text-xs text-red-700" title="Pulse para ver o editar">
              {slot.patientsCount ?? 0} paciente(s)
            </span>
          )}
          {showDetails && !slot.isMyReservation && slot.surgeonName && (
            <div className="mt-1 text-xs text-red-700">{slot.surgeonName}</div>
          )}
          {showDetails && !slot.isMyReservation && slot.patientsCount != null && (
            <div className="text-xs text-red-600">{slot.patientsCount} paciente(s)</div>
          )}
        </>
      )}
    </div>
  );
}
