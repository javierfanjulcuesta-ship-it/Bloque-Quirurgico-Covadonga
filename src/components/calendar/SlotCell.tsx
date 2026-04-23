"use client";

/**
 * Celda de un hueco en el calendario: libre (verde), reservado por el usuario (ámbar) u ocupado (rojo).
 * El cirujano puede pulsar en reservado para programar pacientes y en ocupado (suyo) para ver/editar sus pacientes.
 */

import type { SlotView } from "@/lib/types";
import { FundingBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { useEffect, useRef, useState } from "react";

type SlotQuickAction = "reservar" | "programar" | "detalle";

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
  onQuickAction?: (slot: SlotView, action: SlotQuickAction) => void;
  onDragStartSelect?: (slot: SlotView) => void;
  onDragEnterSelect?: (slot: SlotView) => void;
  onDragEndSelect?: () => void;
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
  onQuickAction,
  onDragStartSelect,
  onDragEnterSelect,
  onDragEndSelect,
}: SlotCellProps) {
  const isFree = slot.status === "free";
  const isReserved = slot.status === "reserved";
  const isOccupied = slot.status === "occupied";
  const isBlocked = slot.status === "blocked";
  const isMyOccupied = isOccupied && slot.isMyReservation;
  const hasPrivate = !!slot.hasPrivate;
  const hasSespa = !!slot.hasSespa;
  const ownUnderutilized = !!slot.isMyReservation && (slot.underutilizedMinutes ?? 0) > 0;
  const baseTone = isBlocked
    ? "text-slate-700"
    : isFree
      ? "text-emerald-900"
      : isReserved
        ? "text-amber-900"
        : "text-slate-900";
  const clickable =
    onSelect &&
    !disabled &&
    !isBlocked &&
    (isFree || isReserved || isMyOccupied);
  const styleClass = isBlocked
    ? "slot-blocked bg-gray-200 border-gray-400 text-gray-600 cursor-not-allowed"
    : hasPrivate
      ? "slot-private"
      : isFree
        ? "slot-free hover:bg-emerald-200"
        : isReserved
          ? "slot-reserved hover:bg-amber-200"
          : hasSespa
            ? "slot-sespa"
            : "slot-occupied";
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellRef = useRef<HTMLDivElement | null>(null);

  const tooltipParts: string[] = [];
  if (isBlocked) {
    tooltipParts.push(slot.blockReason === "URGENT_RESERVED" ? "Reservado para urgencias" : "Cerrado");
  }
  if (slot.surgeonName) tooltipParts.push(`Cirujano: ${slot.surgeonName}`);
  if (slot.patientNames?.length) tooltipParts.push("Pacientes:", ...slot.patientNames);
  if (hasSespa) tooltipParts.push("Este bloque contiene pacientes SESPA");
  if (hasPrivate) tooltipParts.push("Incluye financiación privada");
  if (ownUnderutilized) {
    tooltipParts.push(`Holgura estimada en su bloque: ~${slot.underutilizedMinutes} min`);
  }
  const tooltipTitle = tooltipParts.length > 0 ? tooltipParts.join("\n") : undefined;

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (ev: MouseEvent) => {
      if (!cellRef.current) return;
      if (!cellRef.current.contains(ev.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const handleQuickAction = (action: SlotQuickAction) => {
    setMenuOpen(false);
    if (onQuickAction) {
      onQuickAction(slot, action);
      return;
    }
    onSelect?.(slot);
  };

  const openQuickMenu = () => {
    if (!clickable) return;
    setMenuOpen(true);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      ref={cellRef}
      role={clickable ? "button" : undefined}
      onClick={clickable ? () => onSelect?.(slot) : undefined}
      onContextMenu={(e) => {
        if (!clickable) return;
        e.preventDefault();
        openQuickMenu();
      }}
      onMouseEnter={() => {
        setShowTooltip(true);
        if (clickable) onDragEnterSelect?.(slot);
      }}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseDown={(e) => {
        if (e.button !== 0 || !clickable) return;
        onDragStartSelect?.(slot);
      }}
      onMouseUp={() => onDragEndSelect?.()}
      onTouchStart={() => {
        if (!clickable) return;
        clearLongPress();
        longPressTimer.current = setTimeout(() => openQuickMenu(), 500);
      }}
      onTouchEnd={() => clearLongPress()}
      onTouchCancel={() => clearLongPress()}
      title={tooltipTitle}
      className={`
        relative rounded-md border text-left transition-all duration-150
        ${styleClass}
        ${clickable ? "cursor-pointer" : ""}
        ${disabled ? "cursor-not-allowed opacity-60" : ""}
        ${compact ? "min-h-[48px] min-w-[48px] p-2 text-xs sm:min-h-0 sm:min-w-0 sm:p-1.5" : "p-2 text-sm"}
        ${selected ? "ring-2 ring-[var(--ribera-red)]/80 ring-offset-1" : ""}
        ${assignedToMe ? "ring-2 ring-amber-500/90 ring-offset-1 border-amber-300 bg-amber-50/85" : ""}
        ${clickable ? "hover:shadow-sm hover:brightness-[1.01]" : ""}
      `}
    >
      {timeLabel && (
        <div className={`mb-1 border-b border-current/15 pb-1 text-[10px] font-semibold uppercase tracking-wide opacity-80 ${baseTone}`}>
          {timeLabel}
        </div>
      )}
      <div className="space-y-0.5">
        {isBlocked && (
          <p
            className="text-[11px] font-semibold text-slate-700"
            title={slot.blockReason === "URGENT_RESERVED" ? "Reservado para urgencias" : "Cerrado"}
          >
            {slot.blockReason === "URGENT_RESERVED" ? "Urgencias" : "Cerrado"}
          </p>
        )}
        {isFree && <p className="text-[11px] font-semibold text-emerald-900">Libre</p>}
        {isReserved && (
          <>
            <p className="text-[11px] font-semibold text-amber-900" title="Reserva existente. Pulse para programar pacientes.">
              Reservado
            </p>
            {slot.surgeonName && (
              <p className="truncate text-[10px] text-amber-900/85" title={`Responsable: ${slot.surgeonName}`}>
                {slot.surgeonName}
              </p>
            )}
          </>
        )}
        {isOccupied && (
          <>
            <p className="text-[11px] font-semibold text-slate-900">{isMyOccupied ? "Sus pacientes" : "Ocupado"}</p>
            {!isMyOccupied && slot.surgeonName && (
              <p className="truncate text-[10px] text-slate-600" title={`Responsable: ${slot.surgeonName}`}>
                {slot.surgeonName}
              </p>
            )}
            {isMyOccupied && (
              <p className="text-[10px] text-slate-700" title="Pulse para ver o editar">
                {slot.patientsCount ?? 0} paciente(s)
              </p>
            )}
            {showDetails && !slot.isMyReservation && slot.patientsCount != null && (
              <p className="text-[10px] text-slate-600">{slot.patientsCount} paciente(s)</p>
            )}
          </>
        )}
      </div>
      {(hasSespa || ownUnderutilized) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {hasSespa && <FundingBadge type="sespa" />}
          {ownUnderutilized && (
            <StatusBadge tone="neutral" size="sm">
              {slot.underutilizedLabel ?? "Holgura"} · ~{slot.underutilizedMinutes}m
            </StatusBadge>
          )}
        </div>
      )}
      {showTooltip && (slot.surgeonName || slot.patientsCount != null || slot.totalMinutes || ownUnderutilized) && (
        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700 shadow-lg">
          {slot.surgeonName && <p><span className="font-semibold">Cirujano:</span> {slot.surgeonName}</p>}
          {slot.patientsCount != null && <p><span className="font-semibold">Pacientes:</span> {slot.patientsCount}</p>}
          {(slot.usedMinutes != null || slot.totalMinutes != null) && (
            <p>
              <span className="font-semibold">Tiempo:</span> {slot.usedMinutes ?? 0}/{slot.totalMinutes ?? 0} min
            </p>
          )}
          {ownUnderutilized && <p><span className="font-semibold">Holgura:</span> ~{slot.underutilizedMinutes} min</p>}
        </div>
      )}
      {menuOpen && (
        <div className="absolute right-1 top-1 z-40 min-w-[130px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <button type="button" onClick={() => handleQuickAction("reservar")} className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
            Reservar
          </button>
          <button type="button" onClick={() => handleQuickAction("programar")} className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
            Programar
          </button>
          <button type="button" onClick={() => handleQuickAction("detalle")} className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
            Ver detalle
          </button>
        </div>
      )}
    </div>
  );
}
