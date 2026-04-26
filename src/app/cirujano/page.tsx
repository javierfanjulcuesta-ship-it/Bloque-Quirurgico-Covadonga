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
  cancelPatient,
  cancelReservationEntry,
  updateReservationPatientEntry,
  ReservationsApiError,
} from "@/lib/reservations";
import { fetchBlockPlans } from "@/lib/api/blockOpeningPlan";
import { getAllowedResourcesForRole } from "@/lib/constants";
import { RESOURCES, QUIRUFANO_IDS } from "@/lib/constants";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { deriveReservationBlockState, getReservationTimingSummary } from "@/lib/reservationState";

function slotKey(date: string, resourceId: string, shift: string, slotIndex: number) {
  return `${date}__${resourceId}__${shift}__${slotIndex}`;
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
      x.status !== "cancelled" &&
      x.status !== "released"
  );
  if (!r) return true;
  const isTitular =
    r.surgeonId === titularSurgeonId;
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
    reasonNote: string;
    slotDescriptor: string;
  } | null>(null);
  const [cancelReservationConfirm, setCancelReservationConfirm] = useState<{
    reservationId: string;
    label: string;
    hasPatients: boolean;
    patientsCount: number;
    stateLabel: string;
    reasonNote: string;
    slotDescriptor: string;
  } | null>(null);
  const [cancellingPatient, setCancellingPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<{
    reservationId: string;
    patientId: string;
    numeroHistoria: string;
    procedure: string;
    estimatedDurationMinutes: number;
    anesthesiaType: string;
    entidadFinanciadora: string;
    admissionType: "ingreso" | "ambulatorio";
    notes: string;
  } | null>(null);
  const [savingEditedPatient, setSavingEditedPatient] = useState(false);
  const [gestorSurgeonSoloId, setGestorSurgeonSoloId] = useState("");
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
  const canCancelReservation = !modoDemo && user && hasPermission(user.role, "booking:cancel");

  const handleConfirmCancelPatient = async () => {
    if (!cancelConfirm || cancellingPatient) return;
    setCancellingPatient(true);
    setErrorNotification(null);
    setNotification(null);
    try {
      const reason = cancelConfirm.reasonNote.trim() || undefined;
      const result = await cancelPatient(cancelConfirm.reservationId, cancelConfirm.patientId, reason);
      setCancelConfirm(null);
      await refreshReservations();
      const fallback =
        result.slotOutcome === "retained"
          ? "Paciente anulado. El hueco de este tramo sigue reservado para poder programar otro paciente."
          : result.slotOutcome === "released"
            ? "Paciente anulado. El hueco de este tramo ha pasado a bolsa común (no reservado)."
            : "Paciente anulado correctamente.";
      setNotification(result.message ?? fallback);
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
    if (!cancelReservationConfirm || cancellingPatient) return;
    setCancellingPatient(true);
    setErrorNotification(null);
    setNotification(null);
    try {
      const reason = cancelReservationConfirm.reasonNote.trim() || undefined;
      await cancelReservationEntry(cancelReservationConfirm.reservationId, reason, {
        force: cancelReservationConfirm.hasPatients,
      });
      setCancelReservationConfirm(null);
      await refreshReservations();
      setNotification(
        cancelReservationConfirm.hasPatients
          ? "Anulación completada en este tramo concreto (una reserva = un hueco). Se eliminaron los pacientes de esta celda. Si tenía otros huecos reservados en el mismo día, permanecen hasta que los anule por separado."
          : "Reserva vacía anulada en este tramo. El hueco queda libre en este índice."
      );
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al cancelar reserva";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
    } finally {
      setCancellingPatient(false);
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
      });
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

  /** Pacientes programados: propios del cirujano o todos si actúa como gestor (API ya filtra por rol al cargar). */
  const misPacientesProgramados = useMemo(() => {
    const usersDir = getUsers();
    const list: {
      date: string;
      resourceLabel: string;
      shift: Shift;
      slotIndex: number;
      patient: PatientInBlock;
      reservationId: string;
      surgeonId: string;
      surgeonName: string;
    }[] = [];
    const showAll = !!isGestorScheduler;
    reservations
      .filter((r) => (showAll || r.surgeonId === user?.id) && (r.patients?.length ?? 0) > 0)
      .forEach((r) => {
        const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
        const surgeonName = usersDir.find((u) => u.id === r.surgeonId)?.name ?? r.surgeonId;
        r.patients.forEach((p) => {
          list.push({
            date: r.date,
            resourceLabel,
            shift: r.shift,
            slotIndex: r.slotIndex,
            patient: p,
            reservationId: r.id,
            surgeonId: r.surgeonId,
            surgeonName,
          });
        });
      });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.patient.order - b.patient.order);
  }, [reservations, user?.id, isGestorScheduler]);

  const misReservasResumen = useMemo(() => {
    const showAll = !!isGestorScheduler;
    const own = reservations
      .filter((r) => showAll || r.surgeonId === user?.id)
      .filter((r) => r.status !== "cancelled" && r.status !== "released")
      .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift) || a.slotIndex - b.slotIndex);
    return own.map((r) => {
      const timing = getReservationTimingSummary(r);
      const state = deriveReservationBlockState(r);
      const stateLabel = state === "EMPTY" ? "EMPTY" : state === "PARTIAL" ? "PARTIAL" : state === "FULL" ? "FULL" : "CANCELLED";
      return {
        reservation: r,
        timing,
        state,
        stateLabel,
        resourceLabel: RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId,
      };
    });
  }, [reservations, user?.id, isGestorScheduler]);

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
    if (selectedSlots.some((s) => isNextWeekReserveClosed(s.date))) return;
    if (isGestorScheduler && !gestorSurgeonSoloId.trim()) {
      setNotification(null);
      setErrorNotification("Seleccione el cirujano o endoscopista responsable para la reserva vacía.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    const surgeonIdTarget = isGestorScheduler ? gestorSurgeonSoloId.trim() : user.id;
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
          patients: [],
        });
      }
      setSelectedKeys(new Set());
      setGestorSurgeonSoloId("");
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
    meta?: { responsibleSurgeonId: string; externalSurgeonName?: string }
  ) => {
    if (selectedSlots.length === 0) return;
    if (isGestorScheduler && !meta?.responsibleSurgeonId?.trim()) {
      const msg = "Falta el cirujano responsable.";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
      throw new Error(msg);
    }
    const surgeonIdTargetForResolve = isGestorScheduler ? meta!.responsibleSurgeonId.trim() : user.id;
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
    if (totalPatientMinutes > totalReservedMinutes) {
      setNotification(null);
      setErrorNotification("El tiempo total de los pacientes supera el tiempo reservado. No se ha guardado.");
      setTimeout(() => setErrorNotification(null), 5000);
      return;
    }
    setSavingReservations(true);
    setErrorNotification(null);
    try {
      const surgeonIdTarget = surgeonIdTargetForResolve;
      for (let idx = 0; idx < selectedSlots.length; idx++) {
        const slot = selectedSlots[idx]!;
        const resolvedId = result.resolved.get(`${slot.date}-${slot.shift}-${slot.slotIndex}`) ?? (slot.resourceId as ResourceId);
        const slotPatients = idx === 0 ? patientsWithOrder : [];
        await createReservationEntry({
          date: slot.date,
          resourceId: resolvedId,
          shift: slot.shift,
          slotIndex: slot.slotIndex,
          surgeonId: surgeonIdTarget,
          patients: slotPatients,
        });
      }
      setSelectedKeys(new Set());
      setGestorSurgeonSoloId("");
      setShowProgramarModal(false);
      await refreshReservations();
      setNotification("Pacientes programados correctamente.");
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al programar pacientes";
      setErrorNotification(msg);
      setTimeout(() => setErrorNotification(null), 6000);
      throw err; // rethrow para que el modal no cierre
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
            <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">
              {isGestorScheduler ? "Pacientes y anulaciones (todos los cirujanos)" : "Mis pacientes"}
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              {isGestorScheduler
                ? "Listado de pacientes programados en el bloque. Puede anular un paciente o anular la reserva de un tramo concreto (una fila en base de datos por hueco). Si un cirujano reservó varios tramos seguidos, cada uno se anula por separado."
                : "Pacientes en sus reservas. Puede anular un paciente o anular la reserva de este tramo concreto (un hueco). Si reservó varios tramos seguidos, cancele cada reserva por separado."}
            </p>
            {misReservasResumen.length > 0 && (
              <div className="mb-5 grid gap-3 md:grid-cols-2">
                {misReservasResumen.map(({ reservation, timing, state, stateLabel, resourceLabel }) => (
                  <article key={reservation.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {new Date(reservation.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })} · {resourceLabel} · {reservation.shift === "morning" ? "Mañana" : "Tarde"}
                      </p>
                      <StatusBadge tone={state === "EMPTY" ? "warning" : state === "FULL" ? "success" : "neutral"}>{stateLabel}</StatusBadge>
                    </div>
                    <p className="text-xs text-slate-600">
                      Tiempo total: <strong>{timing.totalMinutes} min</strong> · usado: <strong>{timing.usedMinutes} min</strong> · libre: <strong>{timing.freeMinutes} min</strong>
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Pacientes: <strong>{reservation.patients.length}</strong> {timing.freeMinutes > 0 ? "· puede dejar hueco libre o programar más pacientes." : ""}
                    </p>
                    {canCancelReservation && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const slotsInTurn = getSlots(reservation.shift).length;
                            const slotDescriptor = `${resourceLabel} · ${reservation.date} · ${reservation.shift === "morning" ? "Mañana" : "Tarde"} · tramo ${reservation.slotIndex + 1}/${slotsInTurn} (una reserva = este hueco)`;
                            setCancelReservationConfirm({
                              reservationId: reservation.id,
                              label: `${resourceLabel} ${reservation.shift === "morning" ? "mañana" : "tarde"} (${reservation.date})`,
                              hasPatients: reservation.patients.length > 0,
                              patientsCount: reservation.patients.length,
                              stateLabel,
                              reasonNote: "",
                              slotDescriptor,
                            });
                          }}
                          className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
                        >
                          Anular reserva (este tramo)
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {misPacientesProgramados.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">Aún no tiene pacientes programados. En la pestaña <strong>Reservar / programar</strong>, elija huecos en el calendario y pulse <strong>Reservar y programar pacientes</strong> para añadirlos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Sala</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Turno</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Tramo</th>
                      {isGestorScheduler && (
                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Cirujano titular</th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Paciente / Nº historia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Procedimiento</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duración</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Anestesia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Entidad</th>
                      {canCancelPatient && <th className="px-3 py-2 text-left font-semibold text-gray-700">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {misPacientesProgramados.map(({ date, resourceLabel, shift, slotIndex, patient, reservationId, surgeonName }) => {
                      const isLastPatient = misPacientesProgramados.filter((p) => p.reservationId === reservationId).length === 1;
                      const retentionAllowed = isReservationRetentionStillAllowed(date);
                      const slotsInTurn = getSlots(shift).length;
                      const slotDescriptor = `${resourceLabel} · ${date} · ${shift === "morning" ? "Mañana" : "Tarde"} · tramo ${slotIndex + 1}/${slotsInTurn} (una reserva)`;
                      return (
                        <tr key={`${date}-${resourceLabel}-${shift}-${patient.id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-800">{new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-3 py-2 text-gray-800">{resourceLabel}</td>
                          <td className="px-3 py-2 text-gray-800">{shift === "morning" ? "Mañana" : "Tarde"}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {slotIndex + 1}/{slotsInTurn}
                          </td>
                          {isGestorScheduler && <td className="px-3 py-2 text-gray-800">{surgeonName}</td>}
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-800">{patient.name || "—"}</span>
                            <span className="ml-1 text-gray-500">{patient.numeroHistoria}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{patient.procedure}</td>
                          <td className="px-3 py-2 text-gray-700">{patient.estimatedDurationMinutes} min</td>
                          <td className="px-3 py-2 text-gray-700">{patient.anesthesiaType}</td>
                          <td className="px-3 py-2 text-gray-700">{patient.entidadFinanciadora}</td>
                          {canCancelPatient && (
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingPatient({
                                    reservationId,
                                    patientId: patient.id,
                                    numeroHistoria: patient.numeroHistoria ?? "",
                                    procedure: patient.procedure ?? "",
                                    estimatedDurationMinutes: patient.estimatedDurationMinutes ?? 0,
                                    anesthesiaType: patient.anesthesiaType ?? "",
                                    entidadFinanciadora: patient.entidadFinanciadora ?? "",
                                    admissionType: patient.admissionType ?? "ambulatorio",
                                    notes: patient.notes ?? "",
                                  })
                                }
                                className="rounded border border-blue-300 bg-blue-50 min-h-10 px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
                              >
                                Editar
                              </button>
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
                                    reasonNote: "",
                                    slotDescriptor,
                                  })
                                }
                                className="rounded border border-amber-400 bg-amber-50 min-h-10 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                              >
                                Anular paciente
                              </button>
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

                    {selectedKeys.size > 0 && (
                      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--ribera-red)]/30 bg-ribera-red-pale p-4">
                        <span className="text-sm font-medium text-gray-800">
                          {selectedKeys.size} hueco(s) · {totalReservedMinutes} min
                        </span>
                        {isGestorScheduler && (
                          <label className="min-w-[220px] flex-1">
                            <span className="block text-xs font-medium text-gray-700">Cirujano responsable (solo reservar vacío) *</span>
                            <select
                              value={gestorSurgeonSoloId}
                              onChange={(e) => setGestorSurgeonSoloId(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
                            >
                              <option value="">Seleccione…</option>
                              {surgeonOptionsForGestor.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
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

      {cancelReservationConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="cancel-reservation-title">
          <div className="mx-4 max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 id="cancel-reservation-title" className="mb-2 text-lg font-semibold text-gray-800">Anular reserva (este tramo)</h3>
            <p className="mb-2 text-sm text-gray-600">
              Va a anular <strong>una sola reserva</strong> (un hueco del calendario), no un bloque multi-celda completo salvo que coincida con este único tramo.
            </p>
            <p className="mb-3 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800">{cancelReservationConfirm.slotDescriptor}</p>
            <p className="mb-3 text-sm text-gray-600">
              Reserva seleccionada: <strong>{cancelReservationConfirm.label}</strong>
            </p>
            {cancelReservationConfirm.hasPatients ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Hay {cancelReservationConfirm.patientsCount} paciente(s) en este tramo.</p>
                <p className="mt-1">
                  Estado del bloque: <strong>{cancelReservationConfirm.stateLabel}</strong>. Se eliminarán todos los pacientes de{" "}
                  <strong>esta</strong> reserva y el hueco quedará anulado (cancelado).
                </p>
                {cancelReservationConfirm.patientsCount > 1 ? (
                  <p className="mt-2 text-amber-950/90">Al confirmar, se anulan los {cancelReservationConfirm.patientsCount} pacientes de una vez en este tramo.</p>
                ) : null}
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Reserva sin pacientes: se anula solo este tramo reservado.
              </div>
            )}
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Motivo de anulación (opcional)</span>
              <textarea
                value={cancelReservationConfirm.reasonNote}
                onChange={(e) =>
                  setCancelReservationConfirm((prev) => (prev ? { ...prev, reasonNote: e.target.value } : prev))
                }
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Cambio de planificación, error de reserva…"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelReservationConfirm(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelReservation}
                disabled={cancellingPatient}
                className="rounded-lg border border-rose-500 bg-rose-100 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-200 disabled:opacity-50"
              >
                {cancellingPatient ? "Anulando…" : "Confirmar anulación de reserva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
          <div className="mx-4 max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h3 id="cancel-dialog-title" className="mb-2 text-lg font-semibold text-gray-800">Anular paciente</h3>
            <p className="mb-2 text-sm text-gray-600">
              ¿Confirmar la anulación de <strong>{cancelConfirm.patientLabel}</strong> en este tramo?
            </p>
            <p className="mb-3 rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800">{cancelConfirm.slotDescriptor}</p>
            {cancelConfirm.isLastPatient && (
              <div className={`mb-4 rounded-lg border p-3 text-sm ${cancelConfirm.retentionAllowed ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {cancelConfirm.retentionAllowed
                  ? "Es el último paciente de este tramo: el hueco seguirá reservado (sin pacientes) para poder programar otro caso."
                  : "Es el último paciente y ha pasado el cierre de programación: el hueco de este tramo pasará a bolsa común."}
              </div>
            )}
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Motivo (opcional)</span>
              <textarea
                value={cancelConfirm.reasonNote}
                onChange={(e) => setCancelConfirm((prev) => (prev ? { ...prev, reasonNote: e.target.value } : prev))}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Baja del paciente, reprogramación…"
              />
            </label>
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
                {cancellingPatient ? "Anulando…" : "Confirmar anulación de paciente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProgramarModal && selectedSlots.length > 0 && (
<ProgramarPacientesModal
        slots={selectedSlots}
        schedulerRole={user.role}
        onSave={handleProgramarSave}
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
