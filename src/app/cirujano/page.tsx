"use client";

/**
 * Dashboard cirujano: pestaña "Estado actual del bloque quirúrgico" y "Mi perfil".
 * Vista día en columnas, rangos en filas; verde/rojo/amarillo/blanco. Selección múltiple y reservar o programar pacientes.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getWeekStart,
  toISODate,
  getSlotDurationMinutes,
  getSlots,
  isNextWeekReserveClosed,
  isReservationRetentionStillAllowed,
} from "@/lib/utils";
import {
  getReservations,
  createReservationEntry,
  createReservationBatchEntry,
  cancelReservationEntry,
  cancelPatient,
  updateReservationPatientEntry,
  updateReservationBlockEntry,
  movePatientsBetweenReservationsEntry,
  ReservationsApiError,
} from "@/lib/reservations";
import { fetchBlockPlans } from "@/lib/api/blockOpeningPlan";
import { getAllowedResourcesForRole } from "@/lib/constants";
import { RESOURCES, QUIRUFANO_IDS } from "@/lib/constants";
import { SOLICITUD_RECURSOS_OPTIONS } from "@/lib/constants";
import { modoDemo } from "@/lib/config";
import { getUsers, buildSlotViews } from "@/lib/dataHelpers";
import { ProgramarPacientesModal, type SlotSelection } from "@/components/cirujano/ProgramarPacientesModal";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import type { SlotView } from "@/lib/types";
import { MiPerfil } from "@/components/MiPerfil";
import { ContactarCoordinacion } from "@/components/ContactarCoordinacion";
import { HistoricoView } from "@/components/HistoricoView";
import { NormasProgramacionView } from "@/components/cirujano/NormasProgramacionView";
import { UltimasLiberacionesView } from "@/components/cirujano/UltimasLiberacionesView";
import type { Reservation, ResourceId, PatientInBlock } from "@/lib/types";
import { hasProgrammingAccess, hasGestorAccess, hasAnesthetistAccess, roleLabel } from "@/lib/types";
import { PageShellHeader } from "@/components/ui/PageShellHeader";
import { AppNavTab } from "@/components/ui/AppNavTab";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { CalendarStateLegend } from "@/components/ui/CalendarStateLegend";
import { hasPermission } from "@/lib/auth";
import type { Shift } from "@/lib/types";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";
import { WorkspaceQuickActions } from "@/components/ui/WorkspaceQuickActions";
import {
  buildUnderutilizationHintsByReservationId,
  holguraSuggestionBadgeLabel,
  holguraSuggestionLevel,
} from "@/lib/reservationUnderutilization";
import { findNextConsecutiveRangeByMinutes } from "@/lib/scheduling/nextConsecutiveFreeSuggestion";
import { calculateReservationOccupation, getReservationVisualState } from "@/lib/reservationOccupation";

function slotKey(date: string, resourceId: string, shift: string, slotIndex: number) {
  return `${date}__${resourceId}__${shift}__${slotIndex}`;
}

function patientMoveSelectKey(reservationId: string, patientId: string) {
  return `${reservationId}::${patientId}`;
}

/**
 * Hueco utilizable al resolver quirófano para un titular concreto:
 * - libre (sin reserva activa), o
 * - reserva vacía (0 pacientes) en pending/confirmed del titular — p. ej. creada por gestor a su nombre.
 * Evita que el cirujano quede bloqueado al programar sobre huecos ya reservados vacíos.
 */
function isSlotUsableForTitularInRoom(
  rid: ResourceId,
  date: string,
  shift: Shift,
  slotIndex: number,
  reservations: Reservation[],
  titularSurgeonId: string
): boolean {
  const r = reservations.find(
    (x) =>
      x.resourceId === rid &&
      x.date === date &&
      x.shift === shift &&
      x.slotIndex === slotIndex &&
      x.status !== "cancelled"
  );
  if (!r) return true;
  const isTitular =
    r.surgeonId === titularSurgeonId || (r.coSurgeonIds?.includes(titularSurgeonId) ?? false);
  const noPatients = (r.patients?.length ?? 0) === 0;
  return (
    isTitular &&
    noPatients &&
    (r.status === "pending" || r.status === "confirmed")
  );
}

/** Indica si un recurso está bloqueado (CLOSED/URGENT_RESERVED) para un (date, shift) */
function isResourceBlocked(
  date: string,
  shift: Shift,
  resourceId: string,
  blockPlans: { date: string; shift: string; resourceId: string; status: string }[] | import("@/lib/types").BlockOpeningPlan[]
): boolean {
  const shiftStr = shift === "morning" ? "morning" : "afternoon";
  const plan = blockPlans.find((p) => p.date === date && p.shift === shiftStr && p.resourceId === resourceId);
  return !!plan && (plan.status === "CLOSED" || plan.status === "URGENT_RESERVED");
}

/**
 * Resuelve los slots seleccionados intentando que todos los de quirófano queden en el mismo.
 * Si hay "cualquier-quirofano", busca un quirófano que tenga TODOS los huecos libres y no bloqueado.
 * Slots de procedimientos-menores/tecnicas-dolor se mantienen.
 * @param titularSurgeonId cirujano/endoscopista titular del hueco (session cirujano o el elegido por gestor).
 * @returns Map slotKey -> resourceId, o null si no hay ningún quirófano con todos los huecos libres
 */
function resolveSlotsToSameRoom(
  slots: { date: string; resourceId: string; shift: Shift; slotIndex: number }[],
  reservations: Reservation[],
  blockPlans: { date: string; shift: string; resourceId: string; status: string }[] | import("@/lib/types").BlockOpeningPlan[] = [],
  titularSurgeonId: string
): { resolved: Map<string, ResourceId> } | null {
  const quirófanoSlots = slots.filter(
    (s) => s.resourceId === "cualquier-quirofano" || QUIRUFANO_IDS.includes(s.resourceId as ResourceId)
  );
  const otrosSlots = slots.filter((s) => !QUIRUFANO_IDS.includes(s.resourceId as ResourceId) && s.resourceId !== "cualquier-quirofano");

  const resolved = new Map<string, ResourceId>();
  otrosSlots.forEach((s) => resolved.set(`${s.date}-${s.shift}-${s.slotIndex}`, s.resourceId as ResourceId));

  if (quirófanoSlots.length === 0) return { resolved };

  const conSala = quirófanoSlots.filter((s) => s.resourceId !== "cualquier-quirofano");

  const salasDistintas = new Set(conSala.map((s) => s.resourceId));
  if (salasDistintas.size > 1) return null;

  const candidatos = salasDistintas.size === 1 ? [Array.from(salasDistintas)[0] as ResourceId] : [...QUIRUFANO_IDS];

  for (const rid of candidatos) {
    const anyBlocked = quirófanoSlots.some((s) => isResourceBlocked(s.date, s.shift, rid, blockPlans));
    if (anyBlocked) continue;
    const allFree = quirófanoSlots.every((s) =>
      isSlotUsableForTitularInRoom(rid, s.date, s.shift, s.slotIndex, reservations, titularSurgeonId)
    );
    if (allFree) {
      quirófanoSlots.forEach((s) => resolved.set(`${s.date}-${s.shift}-${s.slotIndex}`, rid));
      return { resolved };
    }
  }

  return null;
}

/**
 * Vista gestor: exige tramos consecutivos en el mismo recurso y turno (bloque amplio coherente con el calendario).
 */
function assertConsecutiveSlotsForGestor(
  slots: SlotSelection[],
  resolved: Map<string, ResourceId>
): string | null {
  const groups = new Map<string, number[]>();
  for (const slot of slots) {
    const mapKey = `${slot.date}-${slot.shift}-${slot.slotIndex}`;
    const rid = resolved.get(mapKey) ?? (slot.resourceId as ResourceId);
    const groupKey = `${slot.date}|${slot.shift}|${rid}`;
    const arr = groups.get(groupKey) ?? [];
    arr.push(slot.slotIndex);
    groups.set(groupKey, arr);
  }
  for (const [, indices] of groups) {
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    if (sorted.length <= 1) continue;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1]! + 1) {
        return "Seleccione huecos consecutivos del mismo quirófano y turno (sin saltos) para un bloque amplio.";
      }
    }
  }
  return null;
}

function normalizeSelectedSlotsToResolvedContext(
  slots: SlotSelection[],
  resolved: Map<string, ResourceId>
): Array<SlotSelection & { resourceId: ResourceId }> {
  return slots
    .map((slot) => {
      const key = `${slot.date}-${slot.shift}-${slot.slotIndex}`;
      const rid = resolved.get(key) ?? (slot.resourceId as ResourceId);
      return { ...slot, resourceId: rid };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
}

function planAutomaticExpansion(params: {
  baseSlots: Array<SlotSelection & { resourceId: ResourceId }>;
  reservations: Reservation[];
  titularSurgeonId: string;
  extraMinutesNeeded: number;
}): { ok: true; additionalSlots: Array<SlotSelection & { resourceId: ResourceId }> } | { ok: false; message: string } {
  const { baseSlots, reservations, titularSurgeonId, extraMinutesNeeded } = params;
  if (extraMinutesNeeded <= 0) return { ok: true, additionalSlots: [] };
  if (!baseSlots.length) return { ok: false, message: "No hay huecos base para ampliar." };

  const first = baseSlots[0]!;
  const sameContext = baseSlots.every(
    (s) => s.date === first.date && s.shift === first.shift && s.resourceId === first.resourceId
  );
  if (!sameContext) {
    return {
      ok: false,
      message: "Para ampliar automáticamente, seleccione huecos del mismo día, turno y recurso.",
    };
  }

  const sortedIndices = [...new Set(baseSlots.map((s) => s.slotIndex))].sort((a, b) => a - b);
  for (let i = 1; i < sortedIndices.length; i++) {
    if (sortedIndices[i] !== sortedIndices[i - 1]! + 1) {
      return {
        ok: false,
        message: "Para ampliar automáticamente, la selección inicial debe ser consecutiva.",
      };
    }
  }

  const used = new Set(sortedIndices);
  let remaining = extraMinutesNeeded;
  let idx = sortedIndices[sortedIndices.length - 1]! + 1;
  const max = getSlots(first.shift).length - 1;
  const additionalSlots: Array<SlotSelection & { resourceId: ResourceId }> = [];

  while (remaining > 0 && idx <= max) {
    if (!used.has(idx)) {
      const free = isSlotUsableForTitularInRoom(
        first.resourceId,
        first.date,
        first.shift,
        idx,
        reservations,
        titularSurgeonId
      );
      if (!free) {
        return { ok: false, message: "No hay hueco consecutivo suficiente para ampliar la reserva." };
      }
      const duration = getSlotDurationMinutes(first.shift, idx);
      additionalSlots.push({
        date: first.date,
        shift: first.shift,
        slotIndex: idx,
        durationMinutes: duration,
        resourceId: first.resourceId,
      });
      remaining -= duration;
    }
    idx += 1;
  }

  if (remaining > 0) {
    return { ok: false, message: "No hay hueco consecutivo suficiente para ampliar la reserva." };
  }

  return { ok: true, additionalSlots };
}

type CirujanoTab = "bloque" | "pacientes" | "perfil" | "coordinacion" | "historico" | "normas" | "liberaciones";

function getCirujanoScreenContext(
  t: CirujanoTab,
  opts: { isGestorScheduler: boolean }
): { title: string; subtitle: string } {
  switch (t) {
    case "bloque":
      return {
        title: "Reservar y programar",
        subtitle: opts.isGestorScheduler
          ? "Seleccione día y franjas contiguas del mismo quirófano; indique el cirujano responsable y use el botón principal rojo cuando tenga selección."
          : "Elija día y celdas en la parrilla. La acción principal es Reservar y programar pacientes (aparece al seleccionar uno o varios huecos).",
      };
    case "pacientes":
      return {
        title: "Mis pacientes",
        subtitle: "Listado de pacientes ya programados en sus reservas; edición y bajas según permisos y normativa de retención.",
      };
    case "historico":
      return { title: "Histórico", subtitle: "Consulta de su actividad y reservas anteriores en el bloque." };
    case "normas":
      return { title: "Normas de programación", subtitle: "Criterios aplicables a la reserva y uso del quirófano." };
    case "liberaciones":
      return {
        title: "Últimas liberaciones",
        subtitle: "Huecos liberados recientemente; puede volver a Reservar / programar para ocuparlos.",
      };
    case "coordinacion":
      return { title: "Contactar coordinación", subtitle: "Mensajes al equipo de coordinación del bloque quirúrgico." };
    case "perfil":
      return { title: "Mi perfil", subtitle: "Datos de cuenta y preferencias en la aplicación." };
    default:
      return { title: "Bloque quirúrgico", subtitle: "" };
  }
}

export default function CirujanoPage() {
  const router = useRouter();
  const { user, logout, hydrated } = useAuth();
  const [tab, setTab] = useState<CirujanoTab>("bloque");
  const [selectedDateForGrid, setSelectedDateForGrid] = useState<Date | null>(null);
  const [calendarPeriodStart, setCalendarPeriodStart] = useState(() => getWeekStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showProgramarModal, setShowProgramarModal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [savingReservations, setSavingReservations] = useState(false);
  const [blockPlans, setBlockPlans] = useState<import("@/lib/types").BlockOpeningPlan[]>([]);
  const [cancelConfirm, setCancelConfirm] = useState<{
    reservationId: string;
    patientId: string;
    patientLabel: string;
    date: string;
    isLastPatient: boolean;
    retentionAllowed: boolean;
  } | null>(null);
  const [cancellingPatient, setCancellingPatient] = useState(false);
  const [cancelReservationConfirm, setCancelReservationConfirm] = useState<{
    reservationId: string;
    date: string;
    resourceLabel: string;
    shiftLabel: string;
    slotIndex: number;
  } | null>(null);
  const [cancellingReservation, setCancellingReservation] = useState(false);
  const [editingPatient, setEditingPatient] = useState<{
    reservationId: string;
    reservationSurgeonId: string;
    reservationExternalSurgeonName?: string;
    patientId: string;
    numeroHistoria: string;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    entidadFinanciadora: string;
    admissionType: "ingreso" | "ambulatorio";
    notes: string;
    solicitudRecursos?: PatientInBlock["solicitudRecursos"];
    responsibleSurgeonId: string;
    externalSurgeonName: string;
  } | null>(null);
  const [savingEditedPatient, setSavingEditedPatient] = useState(false);
  /** Selección para mover pacientes: claves `reservationId::patientId` (solo un bloque origen a la vez). */
  const [movePatientSelectKeys, setMovePatientSelectKeys] = useState<Set<string>>(new Set());
  const [movePatientsModal, setMovePatientsModal] = useState<{
    sourceReservationId: string;
    sourceDate: string;
    targetReservationId: string;
  } | null>(null);
  const [movingPatients, setMovingPatients] = useState(false);
  const [gestorSurgeonSoloId, setGestorSurgeonSoloId] = useState("");
  const [gestorSurgeonSoloManualName, setGestorSurgeonSoloManualName] = useState("");
  const [slotSuggestion, setSlotSuggestion] = useState<{
    date: string;
    shift: Shift;
    resourceId: ResourceId;
    startSlotIndex: number;
    endSlotIndex: number;
  } | null>(null);
  const programDeepLinkConsumedRef = useRef(false);

  /** Enlace desde calendario gestor: ?programDate=&resourceId=&shift=&startSlot=&span=&surgeonId= */
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated || !user || !hasProgrammingAccess(user.role)) return;
    if (programDeepLinkConsumedRef.current) return;

    const sp = new URLSearchParams(window.location.search);
    const programDate = sp.get("programDate");
    const resourceId = sp.get("resourceId");
    const shift = sp.get("shift");
    const startSlotStr = sp.get("startSlot");
    const spanStr = sp.get("span");
    const surgeonIdParam = sp.get("surgeonId");

    if (!programDate || !resourceId || !shift || startSlotStr === null) return;

    programDeepLinkConsumedRef.current = true;

    const stripQuery = () => {
      window.history.replaceState(null, "", window.location.pathname);
    };

    if (shift !== "morning" && shift !== "afternoon") {
      stripQuery();
      return;
    }
    if (!RESOURCES.some((r) => r.id === resourceId)) {
      stripQuery();
      return;
    }

    const start = parseInt(startSlotStr, 10);
    const spanNum = Math.min(Math.max(1, parseInt(spanStr || "1", 10)), 32);
    if (!Number.isFinite(start)) {
      stripQuery();
      return;
    }

    const slotsForShift = getSlots(shift as Shift);
    const maxIdx = slotsForShift.length - 1;
    if (start < 0 || start > maxIdx) {
      stripQuery();
      return;
    }

    const end = Math.min(start + spanNum - 1, maxIdx);
    const keys = new Set<string>();
    for (let i = start; i <= end; i++) {
      keys.add(slotKey(programDate, resourceId, shift, i));
    }

    const d = new Date(programDate + "T12:00:00");
    const ws = getWeekStart(d);
    setSelectedDateForGrid(d);
    setWeekStart(ws);
    setCalendarPeriodStart(ws);
    setTab("bloque");
    setSelectedKeys(keys);
    if (surgeonIdParam && hasGestorAccess(user.role)) {
      setGestorSurgeonSoloId(surgeonIdParam);
    }
    setNotification(
      "Bloque cargado desde el resumen de infrautilización. Revise la selección y use «Reservar y programar pacientes» para añadir o completar casos."
    );
    setTimeout(() => setNotification(null), 8000);
    stripQuery();
  }, [hydrated, user]);

  const refreshReservations = useCallback(async () => {
    setReservationsLoading(true);
    setErrorNotification(null);
    try {
      const from = new Date(weekStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(weekStart);
      to.setDate(to.getDate() + 35);
      const list = await getReservations({
        dateFrom: toISODate(from),
        dateTo: toISODate(to),
      });
      setReservations(list);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al cargar reservas";
      setErrorNotification(msg);
      setReservations([]);
    } finally {
      setReservationsLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    refreshReservations();
  }, [refreshReservations]);

  const refreshBlockPlans = useCallback(async () => {
    if (modoDemo) return;
    try {
      const from = new Date(weekStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(weekStart);
      to.setDate(to.getDate() + 35);
      const plans = await fetchBlockPlans({
        dateFrom: toISODate(from),
        dateTo: toISODate(to),
      });
      setBlockPlans(plans);
    } catch {
      setBlockPlans([]);
    }
  }, [weekStart]);

  useEffect(() => {
    refreshBlockPlans();
  }, [refreshBlockPlans]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasProgrammingAccess(user.role)) {
      router.replace("/calendario");
    }
  }, [user, hydrated, router]);

  const isGestorScheduler = user ? hasGestorAccess(user.role) : false;
  const isGestorAnestesista = user ? hasGestorAccess(user.role) && hasAnesthetistAccess(user.role) : false;
  const surgeonOptionsForGestor = useMemo(() => {
    return getUsers().filter((u) => {
      if (!u.approved) return false;
      const r = String(u.role).trim().toLowerCase().replace(/_/g, "-");
      return r === "cirujano" || r === "endoscopista";
    });
  }, []);
  const allowedResources = useMemo(() => {
    if (!user || !hasProgrammingAccess(user.role)) return [];
    const roleForResources = isGestorAnestesista ? "cirujano" : user.role;
    const base = RESOURCES.filter((r) => getAllowedResourcesForRole(roleForResources).includes(r.id));
    if (roleForResources === "cirujano") {
      return [{ id: "cualquier-quirofano", label: "Cualquier quirófano" }, ...base];
    }
    return base;
  }, [user, isGestorAnestesista]);

  const ownUnderutilizationHints = useMemo(() => {
    if (!user || isGestorScheduler) return new Map<string, { minutesFree: number; slotSpan: number }>();
    const ownReservations = reservations.filter((r) => r.surgeonId === user.id);
    return buildUnderutilizationHintsByReservationId(ownReservations);
  }, [reservations, user, isGestorScheduler]);

  const handleSlotSelect = (slot: SlotView) => {
    const key = slotKey(slot.date, slot.resourceId, slot.shift, slot.slotIndex);
    setSlotSuggestion(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** SlotViews del día seleccionado (columnas = salas, filas = rangos horarios). Incluye "Cualquier quirófano" para cirujano. */
  const slotViewsForSelectedDay = useMemo(() => {
    if (!selectedDateForGrid) return [];
    const weekStartForDay = getWeekStart(selectedDateForGrid);
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      currentUserId: user?.id,
      users: getUsers(),
      blockPlans,
      asGestorForBlocks: isGestorScheduler,
    });
    const dateStr = toISODate(selectedDateForGrid);
    const baseViews = allViews.filter((v) => v.date === dateStr && allowedResources.some((r) => r.id === v.resourceId));
    if (!user || !hasProgrammingAccess(user.role)) return baseViews;
    const quirofanoViews = allViews.filter((v) => v.date === dateStr && QUIRUFANO_IDS.includes(v.resourceId));
    const slotKeys = new Set<string>();
    quirofanoViews.forEach((v) => slotKeys.add(`${v.shift}-${v.slotIndex}`));
    const virtualViews: SlotView[] = [];
    slotKeys.forEach((key) => {
      const [shift, slotIndexStr] = key.split("-");
      const slotIndex = parseInt(slotIndexStr ?? "0", 10);
      const anyFree = QUIRUFANO_IDS.some((rid) => {
        const v = quirofanoViews.find((x) => x.resourceId === rid && x.shift === shift && x.slotIndex === slotIndex);
        return v?.status === "free";
      });
      if (anyFree) {
        virtualViews.push({
          resourceId: "cualquier-quirofano" as ResourceId,
          date: dateStr,
          shift: shift as Shift,
          slotIndex,
          status: "free",
          reservationId: undefined,
          isMyReservation: false,
        });
      }
    });
    const withOwnHints = baseViews.map((v) => {
      if (!v.reservationId || !v.isMyReservation) return v;
      const hint = ownUnderutilizationHints.get(v.reservationId);
      if (!hint) return v;
      const level = holguraSuggestionLevel(hint.minutesFree);
      return {
        ...v,
        underutilizedMinutes: hint.minutesFree,
        underutilizedLabel: level ? holguraSuggestionBadgeLabel(level) : "Holgura",
      };
    });

    return [...virtualViews, ...withOwnHints];
  }, [selectedDateForGrid, reservations, user, allowedResources, blockPlans, isGestorScheduler, ownUnderutilizationHints]);

  /** Claves seleccionadas en formato DaySlotGrid (resourceId-date-shift-slotIndex) */
  const selectedSlotKeysForDay = useMemo(() => {
    const s = new Set<string>();
    selectedKeys.forEach((k) => {
      const parts = k.split("__");
      if (parts.length >= 4) s.add(`${parts[1]}-${parts[0]}-${parts[2]}-${parts[3]}`);
    });
    return s;
  }, [selectedKeys]);

  const selectedSlots = useMemo((): SlotSelection[] => {
    const list: SlotSelection[] = [];
    selectedKeys.forEach((key) => {
      const [date, resourceId, shift, slotIndexStr] = key.split("__");
      const slotIndex = parseInt(slotIndexStr ?? "0", 10);
      const duration = getSlotDurationMinutes(shift as Shift, slotIndex);
      list.push({ date, resourceId, shift: shift as Shift, slotIndex, durationMinutes: duration });
    });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
  }, [selectedKeys]);

  const totalReservedMinutes = selectedSlots.reduce((s, x) => s + x.durationMinutes, 0);

  const canCancelPatient = !modoDemo && user && hasPermission(user.role, "patient:cancel");
  const canEditPatient = !modoDemo && user && hasPermission(user.role, "patient:update");
  const canMovePatientsBetweenBlocks =
    !modoDemo && isGestorScheduler && user && hasPermission(user.role, "booking:update");
  const canCancelOwnReservations = !modoDemo && user && hasPermission(user.role, "booking:cancel");

  const cancellableOwnReservations = useMemo(() => {
    if (!user || !canCancelOwnReservations) return [];
    return reservations
      .filter((r) => r.surgeonId === user.id)
      .filter((r) => r.status !== "cancelled")
      .filter((r) => r.status !== "released")
      .filter((r) => {
        const occupation = calculateReservationOccupation(r);
        const visualState = getReservationVisualState(r, occupation);
        return occupation.occupiedMinutes === 0 || (!occupation.hasClinicalActivity && visualState === "empty");
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.slotIndex - b.slotIndex);
  }, [reservations, user, canCancelOwnReservations]);

  const handleConfirmCancelPatient = async () => {
    if (!cancelConfirm || cancellingPatient) return;
    setCancellingPatient(true);
    setErrorNotification(null);
    setNotification(null);
    try {
      const result = await cancelPatient(cancelConfirm.reservationId, cancelConfirm.patientId);
      setCancelConfirm(null);
      await refreshReservations();
      if (result.slotOutcome === "retained") {
        setNotification("Paciente cancelado. El hueco se mantiene reservado a su nombre para que pueda programar otro paciente.");
      } else if (result.slotOutcome === "released") {
        setNotification("Paciente cancelado. Al haber pasado el cierre del jueves, el hueco ha pasado a la bolsa común y ya no está reservado.");
      } else {
        setNotification("Paciente cancelado correctamente.");
      }
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al cancelar";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
    } finally {
      setCancellingPatient(false);
    }
  };

  const handleConfirmCancelReservation = async () => {
    if (!cancelReservationConfirm || cancellingReservation) return;
    setCancellingReservation(true);
    setErrorNotification(null);
    setNotification(null);
    try {
      await cancelReservationEntry(cancelReservationConfirm.reservationId, "Liberada por cirujano");
      setCancelReservationConfirm(null);
      await refreshReservations();
      setNotification("Reserva anulada correctamente");
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      const apiMessage = err instanceof ReservationsApiError ? err.message : "";
      if (apiMessage.toLowerCase().includes("actividad asociada")) {
        setErrorNotification("Esta reserva no puede anularse porque ya contiene actividad asociada");
      } else {
        setErrorNotification("No se pudo anular la reserva");
      }
      setTimeout(() => setErrorNotification(null), 6000);
    } finally {
      setCancellingReservation(false);
    }
  };

  const handleSaveEditedPatient = async () => {
    if (!editingPatient || savingEditedPatient) return;
    if (!editingPatient.numeroHistoria.trim() || !editingPatient.procedure.trim() || !editingPatient.anesthesiaType.trim() || !editingPatient.entidadFinanciadora.trim()) {
      setErrorNotification("Complete los campos obligatorios del paciente.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    if (!Number.isFinite(editingPatient.estimatedDurationMinutes) || editingPatient.estimatedDurationMinutes <= 0) {
      setErrorNotification("La duración estimada debe ser mayor de 0.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    if (isGestorScheduler && !editingPatient.responsibleSurgeonId.trim() && !editingPatient.externalSurgeonName.trim()) {
      setErrorNotification("Indique titular del bloque con ID o nombre libre.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    setSavingEditedPatient(true);
    setErrorNotification(null);
    try {
      await updateReservationPatientEntry({
        reservationId: editingPatient.reservationId,
        patientId: editingPatient.patientId,
        numeroHistoria: editingPatient.numeroHistoria.trim(),
        procedure: editingPatient.procedure.trim(),
        estimatedDurationMinutes: editingPatient.estimatedDurationMinutes,
        anesthesiaType: editingPatient.anesthesiaType.trim(),
        entidadFinanciadora: editingPatient.entidadFinanciadora.trim(),
        admissionType: editingPatient.admissionType,
        notes: editingPatient.notes,
        solicitudRecursos: editingPatient.solicitudRecursos,
      });
      if (
        editingPatient.responsibleSurgeonId.trim() !== editingPatient.reservationSurgeonId ||
        editingPatient.externalSurgeonName.trim() !== (editingPatient.reservationExternalSurgeonName ?? "")
      ) {
        await updateReservationBlockEntry({
          reservationId: editingPatient.reservationId,
          surgeonId: editingPatient.responsibleSurgeonId.trim() || undefined,
          externalSurgeonName: editingPatient.responsibleSurgeonId.trim()
            ? undefined
            : editingPatient.externalSurgeonName.trim() || undefined,
        });
      }
      setEditingPatient(null);
      await refreshReservations();
      setNotification("Paciente actualizado correctamente.");
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al actualizar paciente";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
    } finally {
      setSavingEditedPatient(false);
    }
  };

  /** Si alguna ranura seleccionada es de la semana siguiente (cerrada a reserva desde el jueves): solo programar, no "Solo reservar" */
  const hasClosedWeekSlot = useMemo(
    () => selectedSlots.some((s) => isNextWeekReserveClosed(s.date)),
    [selectedSlots]
  );

  /** Pacientes ya programados por este cirujano/endoscopista (reservas con pacientes) */
  const misPacientesProgramados = useMemo(() => {
    const surgeonNameById = new Map(getUsers().map((u) => [u.id, u.name]));
    const list: {
      date: string;
      resourceLabel: string;
      shift: Shift;
      patient: PatientInBlock;
      reservationId: string;
      reservationSurgeonId: string;
      reservationExternalSurgeonName?: string;
      reservationSurgeonLabel: string;
    }[] = [];
    reservations
      .filter((r) => (isGestorScheduler ? (r.patients?.length ?? 0) > 0 : r.surgeonId === user?.id && (r.patients?.length ?? 0) > 0))
      .forEach((r) => {
        const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
        const reservationSurgeonLabel = surgeonNameById.get(r.surgeonId) ?? r.externalSurgeonName ?? "—";
        r.patients.forEach((p) => {
          list.push({
            date: r.date,
            resourceLabel,
            shift: r.shift,
            patient: p,
            reservationId: r.id,
            reservationSurgeonId: r.surgeonId,
            reservationExternalSurgeonName: r.externalSurgeonName,
            reservationSurgeonLabel,
          });
        });
      });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.patient.order - b.patient.order);
  }, [reservations, user?.id, isGestorScheduler]);

  const moveTargetReservationOptions = useMemo(() => {
    if (!movePatientsModal) return [];
    const surgeonNameById = new Map(getUsers().map((u) => [u.id, u.name]));
    return reservations
      .filter(
        (r) =>
          r.date === movePatientsModal.sourceDate &&
          r.status !== "cancelled" &&
          r.id !== movePatientsModal.sourceReservationId
      )
      .map((r) => ({
        id: r.id,
        label: `${RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId} · ${
          r.shift === "morning" ? "Mañana" : "Tarde"
        } · tramo ${r.slotIndex} · ${surgeonNameById.get(r.surgeonId) ?? r.externalSurgeonName ?? "Titular no asignado"}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [movePatientsModal, reservations]);

  const toggleMovePatientSelect = useCallback((reservationId: string, patientId: string) => {
    const key = patientMoveSelectKey(reservationId, patientId);
    setMovePatientSelectKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      const first = next.values().next().value as string | undefined;
      if (first) {
        const existingRes = first.split("::")[0];
        if (existingRes && existingRes !== reservationId) next.clear();
      }
      next.add(key);
      return next;
    });
  }, []);

  const openMovePatientsModal = useCallback(() => {
    if (movePatientSelectKeys.size === 0) {
      setErrorNotification("Seleccione al menos un paciente.");
      setTimeout(() => setErrorNotification(null), 5000);
      return;
    }
    const sources = new Set(
      [...movePatientSelectKeys].map((k) => k.split("::")[0]).filter((x): x is string => Boolean(x))
    );
    if (sources.size !== 1) {
      setErrorNotification("Seleccione pacientes del mismo bloque (una sola reserva origen).");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    const sourceReservationId = [...sources][0]!;
    const row = misPacientesProgramados.find((p) => p.reservationId === sourceReservationId);
    if (!row) return;
    setMovePatientsModal({
      sourceReservationId,
      sourceDate: row.date,
      targetReservationId: "",
    });
  }, [movePatientSelectKeys, misPacientesProgramados]);

  const handleConfirmMovePatients = useCallback(async () => {
    if (!movePatientsModal || movingPatients) return;
    if (!movePatientsModal.targetReservationId.trim()) {
      setErrorNotification("Elija el bloque destino.");
      setTimeout(() => setErrorNotification(null), 5000);
      return;
    }
    const patientIds = [...movePatientSelectKeys]
      .map((k) => {
        const parts = k.split("::");
        return parts[1];
      })
      .filter((x): x is string => Boolean(x));
    setMovingPatients(true);
    setErrorNotification(null);
    try {
      const result = await movePatientsBetweenReservationsEntry({
        sourceReservationId: movePatientsModal.sourceReservationId,
        targetReservationId: movePatientsModal.targetReservationId.trim(),
        patientIds,
      });
      setMovePatientsModal(null);
      setMovePatientSelectKeys(new Set());
      await refreshReservations();
      const exp = result.expansionSlotsCreated;
      setNotification(
        exp > 0
          ? `Pacientes movidos correctamente. Se amplió el bloque destino con ${exp} ranura(s) adicional(es).`
          : "Pacientes movidos correctamente."
      );
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al mover pacientes";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 8000);
    } finally {
      setMovingPatients(false);
    }
  }, [movePatientsModal, movePatientSelectKeys, movingPatients, refreshReservations]);

  if (!hydrated || !user || !hasProgrammingAccess(user.role)) {
    return null;
  }

  const screen = useMemo(() => getCirujanoScreenContext(tab, { isGestorScheduler }), [tab, isGestorScheduler]);
  const workspaceQuickActions = useMemo(() => {
    if (isGestorScheduler) {
      return {
        title: "Espacio de programación (gestor)",
        subtitle: "Coordine reservas y programación clínica manteniendo visibilidad global del bloque.",
        nextAction: tab === "bloque" ? "Seleccione día, marque tramos contiguos y use Reservar y programar." : "Vuelva a Reservar / programar para continuar la planificación operativa.",
        actions: [
          { label: "Reservar / programar", onClick: () => setTab("bloque"), primary: true },
          { label: "Mis pacientes", onClick: () => setTab("pacientes") },
          { label: "Últimas liberaciones", onClick: () => setTab("liberaciones") },
          { label: "Volver a calendario", onClick: () => router.push("/calendario") },
        ],
      };
    }
    return {
      title: "Espacio cirujano/endoscopista",
      subtitle: "Su área de trabajo para reservar huecos, programar pacientes y revisar su actividad.",
      nextAction: tab === "bloque" ? "Abra un día en calendario y seleccione huecos para programar." : "Revise su listado y vuelva a Reservar / programar para la siguiente intervención.",
      actions: [
        { label: "Reservar / programar", onClick: () => setTab("bloque"), primary: tab !== "bloque" },
        { label: "Mis pacientes", onClick: () => setTab("pacientes"), primary: tab === "bloque" },
        { label: "Últimas liberaciones", onClick: () => setTab("liberaciones") },
        { label: "Normas", onClick: () => setTab("normas") },
      ],
    };
  }, [isGestorScheduler, tab, router]);

  const handleSoloReservar = async () => {
    if (selectedSlots.length === 0) return;
    setSlotSuggestion(null);
    if (selectedSlots.some((s) => isNextWeekReserveClosed(s.date))) return;
    if (isGestorScheduler && !gestorSurgeonSoloId.trim() && !gestorSurgeonSoloManualName.trim()) {
      setNotification(null);
      setErrorNotification("Seleccione cirujano responsable o escriba nombre libre para la reserva vacía.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    const surgeonIdTarget = isGestorScheduler && gestorSurgeonSoloId.trim() ? gestorSurgeonSoloId.trim() : user.id;
    const result = resolveSlotsToSameRoom(selectedSlots, reservations, blockPlans, surgeonIdTarget);
    if (!result) {
      setNotification(null);
      setErrorNotification("No hay ningún quirófano con todos los huecos seleccionados libres. Seleccione huecos en el mismo quirófano o elija otra combinación.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    if (isGestorScheduler) {
      const convErr = assertConsecutiveSlotsForGestor(selectedSlots, result.resolved);
      if (convErr) {
        setNotification(null);
        setErrorNotification(convErr);
        setTimeout(() => setErrorNotification(null), 6000);
        return;
      }
    }
    setSavingReservations(true);
    setErrorNotification(null);
    try {
      for (const slot of selectedSlots) {
        const resolvedId = result.resolved.get(`${slot.date}-${slot.shift}-${slot.slotIndex}`) ?? (slot.resourceId as ResourceId);
        await createReservationEntry({
          date: slot.date,
          resourceId: resolvedId,
          shift: slot.shift,
          slotIndex: slot.slotIndex,
          surgeonId: surgeonIdTarget,
          externalSurgeonName:
            isGestorScheduler && !gestorSurgeonSoloId.trim() ? gestorSurgeonSoloManualName.trim() || undefined : undefined,
          patients: [],
        });
      }
      setSelectedKeys(new Set());
      setGestorSurgeonSoloId("");
      setGestorSurgeonSoloManualName("");
      await refreshReservations();
      setNotification("Reserva realizada. Los huecos quedan reservados a su nombre.");
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al crear la reserva";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
    } finally {
      setSavingReservations(false);
    }
  };

  const handleProgramarSave = async (
    patients: Omit<PatientInBlock, "id" | "order">[],
    _coSurgeonIds?: string[],
    meta?: { responsibleSurgeonId?: string; externalSurgeonName?: string }
  ) => {
    if (selectedSlots.length === 0) return;
    setSlotSuggestion(null);
    if (isGestorScheduler && !meta?.responsibleSurgeonId?.trim() && !meta?.externalSurgeonName?.trim()) {
      const msg = "Falta el cirujano responsable (ID o nombre libre).";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
      throw new Error(msg);
    }
    const surgeonIdTargetForResolve = isGestorScheduler && meta?.responsibleSurgeonId?.trim()
      ? meta.responsibleSurgeonId.trim()
      : user.id;
    const result = resolveSlotsToSameRoom(selectedSlots, reservations, blockPlans, surgeonIdTargetForResolve);
    if (!result) {
      setNotification(null);
      setErrorNotification("No hay ningún quirófano con todos los huecos seleccionados libres. Seleccione huecos en el mismo quirófano o elija otra combinación.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    if (isGestorScheduler) {
      const convErr = assertConsecutiveSlotsForGestor(selectedSlots, result.resolved);
      if (convErr) {
        setNotification(null);
        setErrorNotification(convErr);
        setTimeout(() => setErrorNotification(null), 6000);
        throw new Error(convErr);
      }
    }
    const patientsWithOrder = patients.map((p) => ({
      ...p,
      admissionType: p.admissionType ?? "ambulatorio" as const,
      solicitudRecursos: p.solicitudRecursos,
    }));
    const totalPatientMinutes = patientsWithOrder.reduce(
      (s, p) => s + p.estimatedDurationMinutes + 10,
      0
    );
    const extraMinutesNeeded = Math.max(0, totalPatientMinutes - totalReservedMinutes);
    const baseResolvedSlots = normalizeSelectedSlotsToResolvedContext(selectedSlots, result.resolved);

    let additionalSlots: Array<SlotSelection & { resourceId: ResourceId }> = [];
    if (extraMinutesNeeded > 0) {
      const expansion = planAutomaticExpansion({
        baseSlots: baseResolvedSlots,
        reservations,
        titularSurgeonId: surgeonIdTargetForResolve,
        extraMinutesNeeded,
      });
      if (!expansion.ok) {
        let suggestedMsg: string | null = null;
        const baseContext = baseResolvedSlots[0];
        if (baseContext) {
          const occupiedSet = new Set(
            reservations
              .filter(
                (r) =>
                  r.date === baseContext.date &&
                  r.shift === baseContext.shift &&
                  r.resourceId === baseContext.resourceId &&
                  r.status !== "cancelled"
              )
              .map((r) => r.slotIndex)
          );
          const selectedSet = new Set(baseResolvedSlots.map((s) => s.slotIndex));
          const totalNeededMinutes = totalPatientMinutes;
          const suggestion = findNextConsecutiveRangeByMinutes({
            startAfterSlotIndex: Math.max(...baseResolvedSlots.map((s) => s.slotIndex)),
            maxSlotIndex: getSlots(baseContext.shift).length - 1,
            requiredMinutes: totalNeededMinutes,
            isSlotFree: (slotIndex) => !occupiedSet.has(slotIndex) && !selectedSet.has(slotIndex),
            getSlotMinutes: (slotIndex) => getSlotDurationMinutes(baseContext.shift, slotIndex),
          });
          if (suggestion) {
            setSlotSuggestion({
              date: baseContext.date,
              shift: baseContext.shift,
              resourceId: baseContext.resourceId,
              startSlotIndex: suggestion.startSlotIndex,
              endSlotIndex: suggestion.endSlotIndex,
            });
            suggestedMsg = `No cabe en la selección actual. Siguiente hueco libre sugerido: slot ${suggestion.startSlotIndex} a ${suggestion.endSlotIndex} en el mismo recurso/turno.`;
          } else {
            setSlotSuggestion(null);
          }
        }
        setNotification(null);
        setErrorNotification(suggestedMsg ?? expansion.message);
        setTimeout(() => setErrorNotification(null), 6000);
        throw new Error(expansion.message);
      }
      additionalSlots = expansion.additionalSlots;
    }
    setSavingReservations(true);
    setErrorNotification(null);
    try {
      const surgeonIdTarget = surgeonIdTargetForResolve;
      const finalSlots = [...baseResolvedSlots, ...additionalSlots].sort(
        (a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex
      );

      // Validación previa contra backend antes de escribir: evita depender solo del estado local.
      if (additionalSlots.length > 0) {
        const sample = finalSlots[0]!;
        const freshReservations = await getReservations({
          dateFrom: sample.date,
          dateTo: sample.date,
          resourceId: sample.resourceId,
        });
        const recheck = planAutomaticExpansion({
          baseSlots: baseResolvedSlots,
          reservations: freshReservations,
          titularSurgeonId: surgeonIdTargetForResolve,
          extraMinutesNeeded,
        });
        if (!recheck.ok) {
          const baseContext = baseResolvedSlots[0];
          if (baseContext) {
            const occupiedSet = new Set(
              freshReservations
                .filter(
                  (r) =>
                    r.date === baseContext.date &&
                    r.shift === baseContext.shift &&
                    r.resourceId === baseContext.resourceId &&
                    r.status !== "cancelled"
                )
                .map((r) => r.slotIndex)
            );
            const selectedSet = new Set(baseResolvedSlots.map((s) => s.slotIndex));
            const suggestion = findNextConsecutiveRangeByMinutes({
              startAfterSlotIndex: Math.max(...baseResolvedSlots.map((s) => s.slotIndex)),
              maxSlotIndex: getSlots(baseContext.shift).length - 1,
              requiredMinutes: totalPatientMinutes,
              isSlotFree: (slotIndex) => !occupiedSet.has(slotIndex) && !selectedSet.has(slotIndex),
              getSlotMinutes: (slotIndex) => getSlotDurationMinutes(baseContext.shift, slotIndex),
            });
            if (suggestion) {
              setSlotSuggestion({
                date: baseContext.date,
                shift: baseContext.shift,
                resourceId: baseContext.resourceId,
                startSlotIndex: suggestion.startSlotIndex,
                endSlotIndex: suggestion.endSlotIndex,
              });
            }
          }
          setNotification(null);
          setErrorNotification("No hay hueco consecutivo suficiente para ampliar la reserva.");
          setTimeout(() => setErrorNotification(null), 6000);
          throw new Error("Automatic expansion failed on backend recheck");
        }
      }

      await createReservationBatchEntry({
        slots: finalSlots.map((slot) => ({
          date: slot.date,
          resourceId: slot.resourceId,
          shift: slot.shift,
          slotIndex: slot.slotIndex,
        })),
        surgeonId: surgeonIdTarget,
        externalSurgeonName:
          isGestorScheduler && !meta?.responsibleSurgeonId?.trim() ? meta?.externalSurgeonName?.trim() || undefined : undefined,
        patients: patientsWithOrder,
        isBatchCreation: true,
      });
      setSelectedKeys(new Set());
      setGestorSurgeonSoloId("");
      setGestorSurgeonSoloManualName("");
      setShowProgramarModal(false);
      await refreshReservations();
      const resourcesPending = patientsWithOrder.filter((p) => !p.solicitudRecursos).length;
      const remainingMinutes = Math.max(0, finalSlots.reduce((s, x) => s + x.durationMinutes, 0) - totalPatientMinutes);
      const parts = ["Pacientes programados correctamente."];
      if (additionalSlots.length > 0) parts.push(`Ampliación automática aplicada: +${additionalSlots.length} hueco(s).`);
      if (remainingMinutes > 0) parts.push(`Tiempo no utilizado estimado: ~${remainingMinutes} min.`);
      if (resourcesPending > 0) parts.push(`Recursos pendientes: ${resourcesPending} paciente(s).`);
      setNotification(parts.join(" "));
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError
        ? err.message
        : "No se pudo crear el bloque completo. No se ha guardado ningún cambio.";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
      throw err; // rethrow para que el modal no cierre
    } finally {
      setSavingReservations(false);
    }
  };

  const handleExpandReservationFromModal = async (
    extraMinutesNeeded: number
  ): Promise<{ ok: boolean; message?: string }> => {
    if (selectedSlots.length === 0 || extraMinutesNeeded <= 0) {
      return { ok: false, message: "No se pudo ampliar la reserva" };
    }
    const surgeonIdTarget = isGestorScheduler && gestorSurgeonSoloId.trim() ? gestorSurgeonSoloId.trim() : user.id;
    const result = resolveSlotsToSameRoom(selectedSlots, reservations, blockPlans, surgeonIdTarget);
    if (!result) {
      return { ok: false, message: "No hay hueco contiguo suficiente para ampliar la reserva" };
    }
    const baseResolvedSlots = normalizeSelectedSlotsToResolvedContext(selectedSlots, result.resolved);
    const expansion = planAutomaticExpansion({
      baseSlots: baseResolvedSlots,
      reservations,
      titularSurgeonId: surgeonIdTarget,
      extraMinutesNeeded,
    });
    if (!expansion.ok || expansion.additionalSlots.length === 0) {
      return { ok: false, message: "No hay hueco contiguo suficiente para ampliar la reserva" };
    }
    try {
      setSavingReservations(true);
      await createReservationBatchEntry({
        slots: expansion.additionalSlots.map((slot) => ({
          date: slot.date,
          resourceId: slot.resourceId,
          shift: slot.shift,
          slotIndex: slot.slotIndex,
        })),
        surgeonId: surgeonIdTarget,
        externalSurgeonName:
          isGestorScheduler && !gestorSurgeonSoloId.trim() ? gestorSurgeonSoloManualName.trim() || undefined : undefined,
        patients: [],
        isBatchCreation: true,
      });
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        expansion.additionalSlots.forEach((slot) => {
          next.add(slotKey(slot.date, slot.resourceId, slot.shift, slot.slotIndex));
        });
        return next;
      });
      await refreshReservations();
      setNotification("Reserva ampliada correctamente");
      setTimeout(() => setNotification(null), 4000);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "";
      if (msg.toLowerCase().includes("ocup")) {
        return { ok: false, message: "No hay hueco contiguo suficiente para ampliar la reserva" };
      }
      return { ok: false, message: "No se pudo ampliar la reserva" };
    } finally {
      setSavingReservations(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageShellHeader
          title={screen.title}
          subtitle={
            <>
              <span className="text-slate-500">Bloque Quirúrgico Covadonga</span>
              <span className="text-slate-400"> · </span>
              {screen.subtitle}
            </>
          }
          roleBadge={roleLabel(user.role)}
          userLine={
            <>
              <span className="text-slate-700">{user.name}</span>
              {isGestorAnestesista ? (
                <>
                  <span className="mx-1.5 text-slate-400">·</span>
                  <button type="button" onClick={() => router.push("/calendario")} className="font-medium text-[var(--ribera-navy)] hover:underline">
                    Ir a calendario
                  </button>
                </>
              ) : null}
              <span className="mx-1.5 text-slate-400">·</span>
              <button type="button" onClick={() => { logout(); router.replace("/"); }} className="font-medium text-[var(--ribera-red)] hover:underline">
                Cerrar sesión
              </button>
            </>
          }
        >
          <div className="overflow-x-auto -mx-1 px-1">
            <nav className="flex flex-wrap gap-2 pb-1" aria-label="Secciones principales">
              {isGestorAnestesista && (
                <AppNavTab active={false} emphasized onClick={() => router.push("/calendario")}>
                  ← Calendario
                </AppNavTab>
              )}
              <AppNavTab active={tab === "bloque"} emphasized={tab !== "bloque"} onClick={() => setTab("bloque")}>
                Reservar / programar
              </AppNavTab>
              <AppNavTab active={tab === "pacientes"} onClick={() => setTab("pacientes")}>
                Mis pacientes
              </AppNavTab>
              <AppNavTab active={tab === "historico"} onClick={() => setTab("historico")}>
                Histórico
              </AppNavTab>
              <AppNavTab active={tab === "normas"} onClick={() => setTab("normas")}>
                Normas de programación
              </AppNavTab>
              <AppNavTab active={tab === "liberaciones"} onClick={() => setTab("liberaciones")}>
                Últimas liberaciones
              </AppNavTab>
              <AppNavTab active={tab === "coordinacion"} onClick={() => setTab("coordinacion")}>
                Contactar coordinación
              </AppNavTab>
              <AppNavTab active={tab === "perfil"} onClick={() => setTab("perfil")}>
                Mi perfil
              </AppNavTab>
            </nav>
          </div>
        </PageShellHeader>
        <WorkspaceQuickActions
          title={workspaceQuickActions.title}
          subtitle={workspaceQuickActions.subtitle}
          nextAction={workspaceQuickActions.nextAction}
          actions={workspaceQuickActions.actions}
          rightContent={
            tab === "bloque" ? (
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                Selección actual: <strong>{selectedKeys.size}</strong> hueco(s)
              </span>
            ) : undefined
          }
        />

        {reservationsLoading && tab === "bloque" && (
          <InlineNotice variant="info">Cargando reservas…</InlineNotice>
        )}
        {errorNotification && <InlineNotice variant="warning">{errorNotification}</InlineNotice>}
        {slotSuggestion && (
          <InlineNotice variant="info">
            Siguiente hueco libre sugerido: {slotSuggestion.resourceId} · {slotSuggestion.shift === "morning" ? "mañana" : "tarde"} · slots{" "}
            {slotSuggestion.startSlotIndex}-{slotSuggestion.endSlotIndex}.
            <button
              type="button"
              onClick={() => {
                const next = new Set<string>();
                for (let i = slotSuggestion.startSlotIndex; i <= slotSuggestion.endSlotIndex; i++) {
                  next.add(slotKey(slotSuggestion.date, slotSuggestion.resourceId, slotSuggestion.shift, i));
                }
                setSelectedKeys(next);
                setSlotSuggestion(null);
                setNotification("Sugerencia aplicada. Revise y vuelva a guardar.");
                setTimeout(() => setNotification(null), 5000);
              }}
              className="ml-2 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
            >
              Usar sugerencia
            </button>
          </InlineNotice>
        )}
        {notification && (
          <InlineNotice variant="success" role="status" aria-live="polite">
            {notification}
          </InlineNotice>
        )}

        {tab === "perfil" && (
          <MiPerfil user={user} />
        )}

        {tab === "coordinacion" && (
          <ContactarCoordinacion user={user} />
        )}

        {tab === "normas" && (
          <NormasProgramacionView />
        )}

        {tab === "liberaciones" && (
          <UltimasLiberacionesView onGoToReservar={() => setTab("bloque")} />
        )}

        {tab === "pacientes" && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Mis pacientes</h2>
            <p className="mb-4 text-sm text-gray-600">
              {isGestorScheduler ? "Pacientes programados en reservas de quirófano (vista global de gestor)." : "Pacientes programados en sus reservas."}
              {canMovePatientsBetweenBlocks && (
                <>
                  {" "}
                  Puede <strong>reordenar entre bloques del mismo día</strong>: marque uno o varios pacientes del mismo bloque y use <strong>Mover a otro bloque</strong> (operación atómica en servidor; el titular pasa a ser el del bloque destino).
                </>
              )}
            </p>
            {canMovePatientsBetweenBlocks && misPacientesProgramados.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-gray-800">
                <span>
                  {movePatientSelectKeys.size > 0
                    ? `${movePatientSelectKeys.size} paciente(s) seleccionado(s) para mover.`
                    : "Marque los pacientes de un mismo bloque (misma fila de reserva) y elija destino."}
                </span>
                <button
                  type="button"
                  onClick={openMovePatientsModal}
                  disabled={movePatientSelectKeys.size === 0}
                  className="rounded-lg border border-sky-600 bg-white px-4 py-2 text-sm font-medium text-sky-900 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mover a otro bloque…
                </button>
                {movePatientSelectKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setMovePatientSelectKeys(new Set())}
                    className="text-sm font-medium text-sky-800 underline decoration-sky-400 hover:text-sky-950"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
            )}
            {misPacientesProgramados.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">Aún no tiene pacientes programados. En la pestaña <strong>Reservar / programar</strong>, elija huecos en el calendario y pulse <strong>Reservar y programar pacientes</strong> para añadirlos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {canMovePatientsBetweenBlocks && (
                        <th className="w-12 px-2 py-2 text-center font-semibold text-gray-700" scope="col">
                          <span className="sr-only">Seleccionar para mover de bloque</span>
                          Mover
                        </th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Sala</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Turno</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Paciente / Nº historia</th>
                      {isGestorScheduler && <th className="px-3 py-2 text-left font-semibold text-gray-700">Titular bloque</th>}
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Procedimiento</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duración</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Anestesia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Entidad</th>
                      {(canEditPatient || canCancelPatient) && <th className="px-3 py-2 text-left font-semibold text-gray-700">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {misPacientesProgramados.map(({ date, resourceLabel, shift, patient, reservationId, reservationSurgeonId, reservationExternalSurgeonName, reservationSurgeonLabel }) => {
                      const isLastPatient = misPacientesProgramados.filter((p) => p.reservationId === reservationId).length === 1;
                      const retentionAllowed = isReservationRetentionStillAllowed(date);
                      return (
                        <tr key={`${date}-${resourceLabel}-${shift}-${patient.id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                          {canMovePatientsBetweenBlocks && (
                            <td className="px-2 py-2 text-center align-middle">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-sky-700 focus:ring-sky-500"
                                checked={movePatientSelectKeys.has(patientMoveSelectKey(reservationId, patient.id))}
                                onChange={() => toggleMovePatientSelect(reservationId, patient.id)}
                                aria-label={`Seleccionar para mover de bloque: ${patient.name || patient.numeroHistoria || "paciente"}`}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 text-gray-800">{new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-3 py-2 text-gray-800">{resourceLabel}</td>
                          <td className="px-3 py-2 text-gray-800">{shift === "morning" ? "Mañana" : "Tarde"}</td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-800">{patient.name || "—"}</span>
                            <span className="ml-1 text-gray-500">{patient.numeroHistoria}</span>
                          </td>
                          {isGestorScheduler && <td className="px-3 py-2 text-gray-700">{reservationSurgeonLabel}</td>}
                          <td className="px-3 py-2 text-gray-700">{patient.procedure}</td>
                          <td className="px-3 py-2 text-gray-700">{patient.estimatedDurationMinutes} min</td>
                          <td className="px-3 py-2 text-gray-700">{patient.anesthesiaType}</td>
                          <td className="px-3 py-2 text-gray-700">{patient.entidadFinanciadora}</td>
                          {(canEditPatient || canCancelPatient) && (
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {canEditPatient && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingPatient({
                                        reservationId,
                                        reservationSurgeonId,
                                        reservationExternalSurgeonName,
                                        patientId: patient.id,
                                        numeroHistoria: patient.numeroHistoria ?? "",
                                        procedure: patient.procedure ?? "",
                                        estimatedDurationMinutes: patient.estimatedDurationMinutes ?? 0,
                                        anesthesiaType: patient.anesthesiaType ?? "",
                                        entidadFinanciadora: patient.entidadFinanciadora ?? "",
                                        admissionType: patient.admissionType ?? "ambulatorio",
                                        notes: patient.notes ?? "",
                                        solicitudRecursos: patient.solicitudRecursos,
                                        responsibleSurgeonId: reservationSurgeonId,
                                        externalSurgeonName: reservationExternalSurgeonName ?? "",
                                      })
                                    }
                                    className="rounded border border-blue-300 bg-blue-50 min-h-10 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
                                  >
                                    Editar
                                  </button>
                                )}
                                {canCancelPatient && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCancelConfirm({
                                        reservationId,
                                        patientId: patient.id,
                                        patientLabel: `${patient.name || patient.numeroHistoria || "Paciente"} (${patient.numeroHistoria || "—"})`,
                                        date,
                                        isLastPatient,
                                        retentionAllowed,
                                      })
                                    }
                                    className="rounded border border-amber-400 bg-amber-50 min-h-10 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                                  >
                                    Cancelar
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "historico" && (
          <HistoricoView user={user} reservations={reservations} />
        )}

        {tab === "bloque" && (
          <>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="shrink-0 max-w-[280px]">
                <WeekGridCalendar
                  periodStart={calendarPeriodStart}
                  onPeriodChange={setCalendarPeriodStart}
                  onSelectDay={(date) => {
                    setSelectedDateForGrid(date);
                    setWeekStart(getWeekStart(date));
                  }}
                  selectedDate={selectedDateForGrid}
                />
              </div>
              <div className="min-w-0 flex-1">
                {selectedDateForGrid ? (
                  <>
                    {selectedDateForGrid && isNextWeekReserveClosed(toISODate(selectedDateForGrid)) && (
                      <InlineNotice variant="warning" className="mb-4">
                        Para esta semana (a partir del jueves) solo puede <strong>programar pacientes directamente</strong> en huecos libres; no puede reservar huecos vacíos.
                      </InlineNotice>
                    )}
                    <CalendarStateLegend variant="compact" className="mb-4" />

                    {canCancelOwnReservations && selectedDateForGrid && (() => {
                      const selectedDateIso = toISODate(selectedDateForGrid);
                      const ownForDay = cancellableOwnReservations.filter((r) => r.date === selectedDateIso);
                      if (ownForDay.length === 0) return null;
                      return (
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                          <p className="text-sm font-semibold text-amber-900">
                            Mis reservas anulables de este día
                          </p>
                          <p className="mt-1 text-xs text-amber-800">
                            Puede liberar huecos reservados por usted sin actividad clínica asociada.
                          </p>
                          <div className="mt-3 space-y-2">
                            {ownForDay.map((r) => {
                              const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
                              const shiftLabel = r.shift === "morning" ? "Mañana" : "Tarde";
                              return (
                                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-100 bg-white px-3 py-2">
                                  <span className="text-sm text-slate-700">
                                    {resourceLabel} · {shiftLabel} · tramo {r.slotIndex}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCancelReservationConfirm({
                                        reservationId: r.id,
                                        date: r.date,
                                        resourceLabel,
                                        shiftLabel,
                                        slotIndex: r.slotIndex,
                                      })
                                    }
                                    className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                                  >
                                    Liberar hueco
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {selectedKeys.size > 0 && (
                      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--ribera-red)]/30 bg-ribera-red-pale p-4">
                        <span className="text-sm font-medium text-gray-800">
                          {selectedKeys.size} hueco(s) · {totalReservedMinutes} min
                        </span>
                        {isGestorScheduler && (
                          <label className="min-w-[220px] flex-1">
                            <span className="block text-xs font-medium text-gray-700">Cirujano responsable (solo reservar vacío)</span>
                            <select
                              value={gestorSurgeonSoloId}
                              onChange={(e) => setGestorSurgeonSoloId(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                            >
                              <option value="">No seleccionado (usar nombre libre)</option>
                              {surgeonOptionsForGestor.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {isGestorScheduler && (
                          <label className="min-w-[220px] flex-1">
                            <span className="block text-xs font-medium text-gray-700">Nombre libre de cirujano (opcional)</span>
                            <input
                              type="text"
                              value={gestorSurgeonSoloManualName}
                              onChange={(e) => setGestorSurgeonSoloManualName(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                              placeholder="Ej. Dr. Externo"
                              maxLength={120}
                            />
                          </label>
                        )}
                        {isGestorScheduler && (
                          <p className="w-full text-xs text-gray-600">
                            Como gestor, elija varios huecos <strong>seguidos</strong> del mismo quirófano y turno para un bloque amplio. Al programar pacientes, el cirujano responsable se indica en el formulario.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowProgramarModal(true)}
                          className="btn-ribera-primary min-h-11 px-6 text-base shadow-md shadow-slate-900/10"
                          disabled={savingReservations}
                        >
                          Reservar y programar pacientes
                        </button>
                        {!hasClosedWeekSlot && (
                          <button type="button" onClick={handleSoloReservar} className="btn-ribera-outline min-h-11" disabled={savingReservations}>
                            Solo reservar
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedKeys(new Set())} className="btn-ribera-secondary min-h-11">
                          Limpiar selección
                        </button>
                        {hasClosedWeekSlot && (
                          <span className="text-xs text-amber-800">Solo programar pacientes en esta semana.</span>
                        )}
                      </div>
                    )}

                    <DaySlotGrid
                      date={selectedDateForGrid}
                      dateLabel={selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      allowedResources={allowedResources}
                      slotViews={slotViewsForSelectedDay}
                      onSlotSelect={handleSlotSelect}
                      selectedSlotKeys={selectedSlotKeysForDay}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center">
                    <p className="text-sm font-medium text-gray-600">Elija un día</p>
                    <p className="mt-1 text-xs text-gray-500">Seleccione una fecha en el calendario para reservar o programar.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {movePatientsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-patients-dialog-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 id="move-patients-dialog-title" className="mb-2 text-lg font-semibold text-gray-800">
              Mover pacientes a otro bloque
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              Solo el <strong>mismo día</strong>. La operación es atómica: o se mueven todos los seleccionados o no cambia nada. Los pacientes quedan en la cabecera del bloque destino y{" "}
              <strong>adoptan el titular (cirujano / nombre libre) de ese bloque</strong>.
            </p>
            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Reserva / bloque destino</span>
              <select
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={movePatientsModal.targetReservationId}
                onChange={(e) =>
                  setMovePatientsModal((prev) =>
                    prev ? { ...prev, targetReservationId: e.target.value } : prev
                  )
                }
              >
                <option value="">Elija destino…</option>
                {moveTargetReservationOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {moveTargetReservationOptions.length === 0 && (
              <p className="mb-4 text-sm text-amber-800">
                No hay otras reservas activas ese día para usar como destino (excluye el bloque origen).
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMovePatientsModal(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={movingPatients}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmMovePatients}
                disabled={
                  movingPatients ||
                  !movePatientsModal.targetReservationId.trim() ||
                  moveTargetReservationOptions.length === 0
                }
                className="rounded-lg border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {movingPatients ? "Moviendo…" : "Confirmar movimiento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
          <div className="mx-4 max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 id="cancel-dialog-title" className="mb-2 text-lg font-semibold text-gray-800">Cancelar paciente</h3>
            <p className="mb-3 text-sm text-gray-600">
              ¿Confirmar la cancelación de <strong>{cancelConfirm.patientLabel}</strong>?
            </p>
            {cancelConfirm.isLastPatient && (
              <div className={`mb-4 rounded-lg border p-3 text-sm ${cancelConfirm.retentionAllowed ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {cancelConfirm.retentionAllowed
                  ? "Al ser el último paciente del hueco, el hueco se mantendrá reservado a su nombre para que pueda programar otro paciente."
                  : "Al ser el último paciente y haber pasado el cierre del jueves, el hueco pasará a la bolsa común y quedará disponible para otros."}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelPatient}
                disabled={cancellingPatient}
                className="rounded-lg border border-amber-500 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                {cancellingPatient ? "Cancelando…" : "Confirmar cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelReservationConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-reservation-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 id="cancel-reservation-dialog-title" className="mb-2 text-lg font-semibold text-gray-800">
              Liberar hueco reservado
            </h3>
            <p className="mb-3 text-sm text-gray-700">
              Vas a liberar este hueco. Podrá volver a ser reservado.
            </p>
            <p className="mb-4 text-sm text-gray-600">
              <strong>{cancelReservationConfirm.resourceLabel}</strong> · {cancelReservationConfirm.shiftLabel} · tramo {cancelReservationConfirm.slotIndex}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelReservationConfirm(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={cancellingReservation}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelReservation}
                disabled={cancellingReservation}
                className="rounded-lg border border-amber-500 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                {cancellingReservation ? "Liberando…" : "Liberar hueco"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProgramarModal && selectedSlots.length > 0 && (
<ProgramarPacientesModal
        slots={selectedSlots}
        currentUserId={user.id}
        schedulerRole={user.role}
        initialResponsibleSurgeonId={isGestorScheduler ? gestorSurgeonSoloId : undefined}
        initialExternalSurgeonName={isGestorScheduler && !gestorSurgeonSoloId.trim() ? gestorSurgeonSoloManualName : undefined}
        onSave={handleProgramarSave}
        onRequestExpandReservation={handleExpandReservationFromModal}
        onClose={() => setShowProgramarModal(false)}
        saving={savingReservations}
      />
      )}

      {editingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">Editar paciente en su reserva</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="block text-sm font-medium text-gray-700">Nº historia *</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.numeroHistoria} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, numeroHistoria: e.target.value } : prev)} />
              </label>
              <label>
                <span className="block text-sm font-medium text-gray-700">Entidad *</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.entidadFinanciadora} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, entidadFinanciadora: e.target.value } : prev)} />
              </label>
              <label className="sm:col-span-2">
                <span className="block text-sm font-medium text-gray-700">Procedimiento *</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.procedure} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, procedure: e.target.value } : prev)} />
              </label>
              <label>
                <span className="block text-sm font-medium text-gray-700">Anestesia *</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.anesthesiaType} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, anesthesiaType: e.target.value } : prev)} />
              </label>
              <label>
                <span className="block text-sm font-medium text-gray-700">Duración (min) *</span>
                <input type="number" min={1} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.estimatedDurationMinutes} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, estimatedDurationMinutes: parseInt(e.target.value || "0", 10) || 0 } : prev)} />
              </label>
              <label>
                <span className="block text-sm font-medium text-gray-700">Ingreso/ambulatorio</span>
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.admissionType} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, admissionType: e.target.value as "ingreso" | "ambulatorio" } : prev)}>
                  <option value="ambulatorio">Ambulatorio</option>
                  <option value="ingreso">Ingreso</option>
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="block text-sm font-medium text-gray-700">Notas</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={editingPatient.notes} onChange={(e) => setEditingPatient((prev) => prev ? { ...prev, notes: e.target.value } : prev)} />
              </label>
              <label>
                <span className="block text-sm font-medium text-gray-700">Recursos (opcional)</span>
                <select
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={editingPatient.solicitudRecursos ?? ""}
                  onChange={(e) =>
                    setEditingPatient((prev) =>
                      prev ? { ...prev, solicitudRecursos: (e.target.value || undefined) as PatientInBlock["solicitudRecursos"] } : prev
                    )
                  }
                >
                  <option value="">Sin definir</option>
                  {SOLICITUD_RECURSOS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {isGestorScheduler && (
                <>
                  <label>
                    <span className="block text-sm font-medium text-gray-700">Titular bloque (ID interno)</span>
                    <select
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      value={editingPatient.responsibleSurgeonId}
                      onChange={(e) => setEditingPatient((prev) => (prev ? { ...prev, responsibleSurgeonId: e.target.value } : prev))}
                    >
                      <option value="">No asignado (usar nombre libre)</option>
                      {surgeonOptionsForGestor.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="block text-sm font-medium text-gray-700">Titular bloque (nombre libre)</span>
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      value={editingPatient.externalSurgeonName}
                      onChange={(e) => setEditingPatient((prev) => (prev ? { ...prev, externalSurgeonName: e.target.value } : prev))}
                      placeholder="Ej. Dr. Rojas"
                      maxLength={120}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingPatient(null)} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={handleSaveEditedPatient} disabled={savingEditedPatient} className="rounded bg-[var(--ribera-red)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                {savingEditedPatient ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
