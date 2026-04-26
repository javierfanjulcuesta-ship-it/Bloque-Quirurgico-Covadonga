"use client";

/**
 * Gestor: vista de toda la semana con reservas y pacientes.
 * Los pacientes de financiación privada se muestran remarcados (naranja).
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { getReservationsInPeriod, getUsers } from "@/lib/dataHelpers";
import { RESOURCES, LARGE_BLOCK_REMAINDER_MINUTES } from "@/lib/constants";
import { WeekNavigation } from "@/components/calendar/WeekNavigation";
import type { Reservation, User } from "@/lib/types";
import { isPrivateFunding, isSespa } from "@/lib/patientInsurance";
import {
  buildUnderutilizationHintsByReservationId,
  listUnderutilizedBlocks,
  sortUnderutilizedBlocksForGestorPanel,
  buildCirujanoProgramDeepLink,
  holguraSuggestionLevel,
  holguraSuggestionBadgeLabel,
  holguraSuggestionPhrase,
  HOLGURA_SUGGESTION_MEDIUM_MINUTES,
  type UnderutilizationHint,
  type UnderutilizedBlockSummary,
} from "@/lib/reservationUnderutilization";
import { SectionIntro } from "@/components/ui/PageShellHeader";
import { CalendarStateLegend } from "@/components/ui/CalendarStateLegend";
import { FundingBadge, StatusBadge } from "@/components/ui/StatusBadge";

const DAY_SECTION_PREFIX = "vista-semanal-dia-";
const BLOCK_SECTION_PREFIX = "vista-semanal-bloque-";

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function HintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 16v-5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ProgramarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function VistaSemanal({
  storedReservations = [],
  addedUsers = [],
}: {
  storedReservations?: Reservation[];
  addedUsers?: User[];
} = {}) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const from = toISODate(weekDays[0]);
  const to = toISODate(weekDays[weekDays.length - 1]);
  const reservations = useMemo(
    () => getReservationsInPeriod(from, to, storedReservations),
    [from, to, storedReservations]
  );
  const users = useMemo(() => getUsers(addedUsers), [addedUsers]);

  const underutilHints = useMemo(
    () => buildUnderutilizationHintsByReservationId(reservations),
    [reservations]
  );
  const underutilizedBlocks = useMemo(() => listUnderutilizedBlocks(reservations), [reservations]);

  const scrollToUnderutilizedBlock = useCallback((block: UnderutilizedBlockSummary) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    const blockEl = document.getElementById(`${BLOCK_SECTION_PREFIX}${block.firstReservationId}`);
    const dayEl = document.getElementById(`${DAY_SECTION_PREFIX}${block.date}`);
    const target = blockEl ?? dayEl;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedBlockId(block.firstReservationId);
    highlightTimer.current = setTimeout(() => setHighlightedBlockId(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      <SectionIntro
        title="Vista semanal del bloque"
        description="Resumen por día y recurso. Los tonos de financiación coinciden con el calendario (privado / SESPA). Use el panel de holgura para saltar a bloques con tiempo disponible."
      />
      <CalendarStateLegend variant="compact" className="max-w-3xl" />
      <WeekNavigation weekStart={weekStart} onWeekChange={setWeekStart} canGoNext={true} />
      {reservations.length > 0 && (
        <UnderutilizedWeekPanel
          blocks={underutilizedBlocks}
          users={users}
          onViewBlock={scrollToUnderutilizedBlock}
        />
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {reservations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-gray-500">No hay reservas en esta semana.</p>
        ) : (
          <div className="space-y-6">
            {weekDays.map((day) => {
              const dateStr = toISODate(day);
              const dayReservations = reservations
                .filter((r) => r.date === dateStr)
                .slice()
                .sort((a, b) => {
                  const rc = a.resourceId.localeCompare(b.resourceId);
                  if (rc !== 0) return rc;
                  const sc = a.shift.localeCompare(b.shift);
                  if (sc !== 0) return sc;
                  return a.slotIndex - b.slotIndex;
                });
              const dayLabel = day.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              return (
                <div key={dateStr} id={`${DAY_SECTION_PREFIX}${dateStr}`} className="scroll-mt-4 rounded-xl border border-gray-200">
                  <div className="border-b border-gray-200 bg-ribera-gray-light px-4 py-2 font-semibold capitalize text-gray-800">
                    {dayLabel}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {dayReservations.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400">Ninguna reserva este día</p>
                    ) : (
                      dayReservations.map((res) => (
                        <ReservationBlock
                          key={res.id}
                          reservation={res}
                          users={users}
                          utilHint={underutilHints.get(res.id)}
                          domId={underutilHints.has(res.id) ? `${BLOCK_SECTION_PREFIX}${res.id}` : undefined}
                          highlight={highlightedBlockId === res.id && !!underutilHints.get(res.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UnderutilizedWeekPanel({
  blocks,
  users,
  onViewBlock,
}: {
  blocks: UnderutilizedBlockSummary[];
  users: User[];
  onViewBlock: (b: UnderutilizedBlockSummary) => void;
}) {
  const [shiftFilter, setShiftFilter] = useState<"all" | "morning" | "afternoon">("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [surgeonFilter, setSurgeonFilter] = useState<string>("all");

  const sortedAll = useMemo(() => sortUnderutilizedBlocksForGestorPanel(blocks), [blocks]);

  const surgeonOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of sortedAll) {
      if (!m.has(b.surgeonId)) {
        m.set(b.surgeonId, users.find((u) => u.id === b.surgeonId)?.name ?? b.surgeonId);
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [sortedAll, users]);

  const filtered = useMemo(() => {
    return sortedAll.filter((b) => {
      if (shiftFilter !== "all" && b.shift !== shiftFilter) return false;
      if (resourceFilter !== "all" && b.resourceId !== resourceFilter) return false;
      if (surgeonFilter !== "all" && b.surgeonId !== surgeonFilter) return false;
      return true;
    });
  }, [sortedAll, shiftFilter, resourceFilter, surgeonFilter]);

  const filtersActive = shiftFilter !== "all" || resourceFilter !== "all" || surgeonFilter !== "all";

  const clearFilters = () => {
    setShiftFilter("all");
    setResourceFilter("all");
    setSurgeonFilter("all");
  };

  if (blocks.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-gray-600" role="status">
        Ningún bloque con holgura amplia (≥ {LARGE_BLOCK_REMAINDER_MINUTES} min) en esta semana.
      </p>
    );
  }

  const countLabel =
    filtered.length === blocks.length ? String(blocks.length) : `${filtered.length}/${blocks.length}`;

  const shiftChip = (value: "all" | "morning" | "afternoon", label: string) => {
    const active = shiftFilter === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setShiftFilter(value)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          active
            ? "border-[var(--ribera-navy)] bg-[var(--ribera-navy)] text-white"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <section
      className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-slate-50/40 p-4 shadow-sm"
      aria-labelledby="underutil-week-heading"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ClockIcon className="shrink-0 text-amber-800" />
        <h3 id="underutil-week-heading" className="text-sm font-bold text-[var(--ribera-navy)]">
          Bloques infrautilizados de la semana
        </h3>
        <span
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
          title={filtersActive ? "Coincidencias con filtros / total en la semana" : "Bloques con holgura amplia"}
        >
          {countLabel}
        </span>
      </div>
      <p className="mb-2 text-xs text-gray-600">
        Holgura = tiempo reservado menos duración efectiva (duración + 10 min/procedimiento). Umbral ≥{" "}
        {LARGE_BLOCK_REMAINDER_MINUTES} min. Sugerencia: {LARGE_BLOCK_REMAINDER_MINUTES}–{HOLGURA_SUGGESTION_MEDIUM_MINUTES - 1}{" "}
        min → corto; ≥ {HOLGURA_SUGGESTION_MEDIUM_MINUTES} min → medio (orientativo).
      </p>
      <p className="mb-3 text-[11px] font-medium text-slate-600">
        <span className="text-[var(--ribera-navy)]">Orden:</span> mayor holgura primero (min libres ↓). Empates: fecha → sala →
        turno. Barra de color: verde = mayor prioridad de la lista; gris = caso medio; ámbar = caso corto.{" "}
        <strong>Programar</strong> abre Estado del bloque con el día y los tramos del bloque ya seleccionados (misma lógica que
        elegir huecos a mano).
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Turno</span>
        <div className="flex flex-wrap gap-1.5">
          {shiftChip("all", "Todos")}
          {shiftChip("morning", "Mañana")}
          {shiftChip("afternoon", "Tarde")}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[140px] flex-1 flex-col gap-0.5 text-[11px] font-medium text-gray-600">
          Recurso
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
          >
            <option value="all">Todos</option>
            {RESOURCES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-0.5 text-[11px] font-medium text-gray-600">
          Cirujano titular
          <select
            value={surgeonFilter}
            onChange={(e) => setSurgeonFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
          >
            <option value="all">Todos</option>
            {surgeonOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="mb-0.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-300/80 bg-white/60 px-3 py-4 text-center text-xs text-gray-700">
          <p className="mb-2">Ningún bloque cumple los filtros seleccionados.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="font-semibold text-[var(--ribera-navy)] underline decoration-from-font hover:opacity-90"
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((b, index) => {
            const surgeon = users.find((u) => u.id === b.surgeonId);
            const resourceLabel = RESOURCES.find((r) => r.id === b.resourceId)?.label ?? b.resourceId;
            const shiftLabel = b.shift === "morning" ? "Mañana" : "Tarde";
            const dayDate = new Date(b.date + "T12:00:00");
            const dayShort = dayDate.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
            const sugLevel = holguraSuggestionLevel(b.minutesFree);
            const sugPhrase = holguraSuggestionPhrase(b.minutesFree);
            const isTop = index === 0;
            const accentBorder = isTop
              ? "border-l-red-700"
              : sugLevel === "medium"
                ? "border-l-slate-600"
                : "border-l-amber-600";
            return (
              <li
                key={b.firstReservationId}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200/70 border-l-4 bg-white/90 py-2.5 pl-3 pr-3 text-sm shadow-sm ${accentBorder} ${
                  isTop ? "bg-red-50/50" : ""
                }`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {isTop && (
                      <StatusBadge tone="success">
                        Mayor holgura
                      </StatusBadge>
                    )}
                    <p className="font-semibold capitalize text-gray-900">{dayShort}</p>
                    {sugLevel && (
                      <StatusBadge tone="neutral" className="gap-0.5">
                        <HintIcon className="text-slate-600" />
                        {holguraSuggestionBadgeLabel(sugLevel)}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-xs text-gray-700">
                    <span className="font-medium text-[var(--ribera-navy)]">{resourceLabel}</span>
                    {" · "}
                    {shiftLabel}
                    {" · "}
                    <span title="Cirujano titular del bloque">{surgeon?.name ?? "—"}</span>
                  </p>
                  <p className={`text-amber-950/90 tabular-nums ${isTop ? "text-sm" : "text-xs"}`}>
                    ~
                    <strong className={isTop ? "text-base text-gray-900" : ""}>{b.minutesFree} min</strong> libres ·{" "}
                    {b.slotSpan} tramo{b.slotSpan === 1 ? "" : "s"} · {b.patientCount} paciente
                    {b.patientCount === 1 ? "" : "s"}
                  </p>
                  {sugPhrase && <p className="text-[11px] leading-snug text-slate-600">{sugPhrase}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => onViewBlock(b)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Ver en lista
                  </button>
                  <Link
                    href={buildCirujanoProgramDeepLink(b)}
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isTop
                        ? "border-[var(--ribera-red)]/40 bg-[var(--ribera-red)]/10 text-[var(--ribera-red)] hover:bg-[var(--ribera-red)]/15"
                        : "border-[var(--ribera-navy)]/30 bg-[var(--ribera-navy)]/5 text-[var(--ribera-navy)] hover:bg-[var(--ribera-navy)]/10"
                    }`}
                    title="Abre Estado del bloque con día, sala y tramos seleccionados para programar"
                  >
                    <ProgramarIcon className="opacity-90" />
                    Programar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ReservationBlock({
  reservation,
  users,
  utilHint,
  domId,
  highlight,
}: {
  reservation: Reservation;
  users: User[];
  utilHint?: UnderutilizationHint;
  domId?: string;
  highlight?: boolean;
}) {
  const surgeon = users.find((u) => u.id === reservation.surgeonId);
  const resourceLabel = RESOURCES.find((r) => r.id === reservation.resourceId)?.label ?? reservation.resourceId;
  const shiftLabel = reservation.shift === "morning" ? "Mañana" : "Tarde";
  const sugLevel = utilHint ? holguraSuggestionLevel(utilHint.minutesFree) : null;
  const sugPhrase = utilHint ? holguraSuggestionPhrase(utilHint.minutesFree) : null;
  const holguraTitle = utilHint
    ? `Tiempo reservado en el bloque (tramos consecutivos) menos duración efectiva de pacientes (duración + 10 min por procedimiento). ${sugPhrase ?? ""} Orientativo; no garantiza encaje.`
    : undefined;

  return (
    <div
      id={domId}
      className={`p-4 transition-shadow duration-300 scroll-mt-6 ${
        highlight ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-white" : ""
      }`}
    >
      <p className="mb-2 text-sm font-medium text-gray-700">
        {resourceLabel} – {shiftLabel} – {surgeon?.name ?? "-"}
      </p>
      {utilHint && (
        <div className="mb-2 max-w-full space-y-1" title={holguraTitle}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex flex-wrap items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1 text-xs text-amber-950">
              <span className="font-semibold">Holgura</span>
              <span>
                ~{utilHint.minutesFree} min libres
                {utilHint.slotSpan > 1 ? ` · ${utilHint.slotSpan} tramos` : ""}
              </span>
            </span>
            {sugLevel && (
              <StatusBadge tone="neutral" className="gap-0.5">
                <HintIcon className="text-slate-600" />
                {holguraSuggestionBadgeLabel(sugLevel)}
              </StatusBadge>
            )}
          </div>
          {sugPhrase && <p className="text-[11px] leading-snug text-slate-600">{sugPhrase}</p>}
        </div>
      )}
      <ul className="space-y-1">
        {reservation.patients.map((p) => {
          const privada = isPrivateFunding(p.entidadFinanciadora);
          const sespa = isSespa(p.entidadFinanciadora);
          const rowClass = sespa
            ? "border border-rose-300 bg-rose-100 text-rose-900"
            : privada
              ? "border border-orange-300 bg-orange-100 text-orange-900"
              : "bg-gray-50 text-gray-800";
          return (
            <li key={p.id} className={`rounded px-3 py-2 text-sm ${rowClass}`}>
              <span className="font-medium">{p.numeroHistoria}</span>
              {" – "}
              {p.procedure}
              {p.estimatedDurationMinutes ? ` (${p.estimatedDurationMinutes} min)` : ""}
              {" – "}
              <span className={privada || sespa ? "font-semibold" : ""}>
                {p.entidadFinanciadora || "—"}
                {sespa && (
                  <>
                    {" "}
                    <FundingBadge type="sespa" />
                  </>
                )}
                {privada && !sespa && (
                  <>
                    {" "}
                    <FundingBadge type="private" />
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
