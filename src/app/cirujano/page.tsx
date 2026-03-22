"use client";

/**
 * Dashboard cirujano: pestaña "Estado actual del bloque quirúrgico" y "Mi perfil".
 * Vista día en columnas, rangos en filas; verde/rojo/amarillo/blanco. Selección múltiple y reservar o programar pacientes.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getWeekStart, toISODate, getSlotDurationMinutes, isNextWeekReserveClosed, isReservationRetentionStillAllowed } from "@/lib/utils";
import { getReservations, createReservationEntry, cancelPatient, ReservationsApiError } from "@/lib/reservations";
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
import { hasProgrammingAccess, hasGestorAccess, hasAnesthetistAccess } from "@/lib/types";
import { hasPermission } from "@/lib/auth";
import type { Shift } from "@/lib/types";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";

function slotKey(date: string, resourceId: string, shift: string, slotIndex: number) {
  return `${date}__${resourceId}__${shift}__${slotIndex}`;
}

/** Comprueba si un quirófano tiene un slot libre */
function isSlotFreeInRoom(
  rid: ResourceId,
  date: string,
  shift: Shift,
  slotIndex: number,
  reservations: Reservation[]
): boolean {
  return !reservations.some(
    (r) =>
      r.resourceId === rid &&
      r.date === date &&
      r.shift === shift &&
      r.slotIndex === slotIndex &&
      r.status !== "cancelled"
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
 * @returns Map slotKey -> resourceId, o null si no hay ningún quirófano con todos los huecos libres
 */
function resolveSlotsToSameRoom(
  slots: { date: string; resourceId: string; shift: Shift; slotIndex: number }[],
  reservations: Reservation[],
  blockPlans: { date: string; shift: string; resourceId: string; status: string }[] = []
): { resolved: Map<string, ResourceId> } | null {
  const quirófanoSlots = slots.filter(
    (s) => s.resourceId === "cualquier-quirofano" || QUIRUFANO_IDS.includes(s.resourceId as ResourceId)
  );
  const otrosSlots = slots.filter((s) => !QUIRUFANO_IDS.includes(s.resourceId as ResourceId) && s.resourceId !== "cualquier-quirofano");

  const resolved = new Map<string, ResourceId>();
  otrosSlots.forEach((s) => resolved.set(`${s.date}-${s.shift}-${s.slotIndex}`, s.resourceId as ResourceId));

  if (quirófanoSlots.length === 0) return { resolved };

  const conCualquier = quirófanoSlots.filter((s) => s.resourceId === "cualquier-quirofano");
  const conSala = quirófanoSlots.filter((s) => s.resourceId !== "cualquier-quirofano");

  const salasDistintas = new Set(conSala.map((s) => s.resourceId));
  if (salasDistintas.size > 1) return null;

  const candidatos = salasDistintas.size === 1 ? [Array.from(salasDistintas)[0] as ResourceId] : [...QUIRUFANO_IDS];

  for (const rid of candidatos) {
    const anyBlocked = quirófanoSlots.some((s) => isResourceBlocked(s.date, s.shift, rid, blockPlans));
    if (anyBlocked) continue;
    const allFree = quirófanoSlots.every((s) => isSlotFreeInRoom(rid, s.date, s.shift, s.slotIndex, reservations));
    if (allFree) {
      quirófanoSlots.forEach((s) => resolved.set(`${s.date}-${s.shift}-${s.slotIndex}`, rid));
      return { resolved };
    }
  }

  return null;
}

export default function CirujanoPage() {
  const router = useRouter();
  const { user, logout, hydrated } = useAuth();
  const [tab, setTab] = useState<"bloque" | "pacientes" | "perfil" | "coordinacion" | "historico" | "normas" | "liberaciones">("bloque");
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

  const isGestorAnestesista = user ? hasGestorAccess(user.role) && hasAnesthetistAccess(user.role) : false;
  const allowedResources = useMemo(() => {
    if (!user || !hasProgrammingAccess(user.role)) return [];
    const roleForResources = isGestorAnestesista ? "cirujano" : user.role;
    const base = RESOURCES.filter((r) => getAllowedResourcesForRole(roleForResources).includes(r.id));
    if (roleForResources === "cirujano") {
      return [{ id: "cualquier-quirofano", label: "Cualquier quirófano" }, ...base];
    }
    return base;
  }, [user, isGestorAnestesista]);
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
    const isGestorForBlocks = isGestorAnestesista;
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      currentUserId: user?.id,
      users: getUsers(),
      blockPlans,
      asGestorForBlocks: isGestorForBlocks,
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
    return [...virtualViews, ...baseViews];
  }, [selectedDateForGrid, reservations, user, allowedResources, blockPlans, isGestorAnestesista]);

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

  /** Si alguna ranura seleccionada es de la semana siguiente (cerrada a reserva desde el jueves): solo programar, no "Solo reservar" */
  const hasClosedWeekSlot = useMemo(
    () => selectedSlots.some((s) => isNextWeekReserveClosed(s.date)),
    [selectedSlots]
  );

  /** Pacientes ya programados por este cirujano/endoscopista (reservas con pacientes) */
  const misPacientesProgramados = useMemo(() => {
    const list: { date: string; resourceLabel: string; shift: Shift; patient: PatientInBlock; reservationId: string }[] = [];
    reservations
      .filter((r) => r.surgeonId === user?.id && r.patients?.length > 0)
      .forEach((r) => {
        const resourceLabel = RESOURCES.find((res) => res.id === r.resourceId)?.label ?? r.resourceId;
        r.patients.forEach((p) => {
          list.push({ date: r.date, resourceLabel, shift: r.shift, patient: p, reservationId: r.id });
        });
      });
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.patient.order - b.patient.order);
  }, [reservations, user?.id]);

  if (!hydrated || !user || !hasProgrammingAccess(user.role)) {
    return null;
  }

  const handleSoloReservar = async () => {
    if (selectedSlots.length === 0) return;
    if (selectedSlots.some((s) => isNextWeekReserveClosed(s.date))) return;
    const result = resolveSlotsToSameRoom(selectedSlots, reservations, blockPlans);
    if (!result) {
      setNotification(null);
      setErrorNotification("No hay ningún quirófano con todos los huecos seleccionados libres. Seleccione huecos en el mismo quirófano o elija otra combinación.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    setSavingReservations(true);
    setErrorNotification(null);
    try {
      for (const slot of selectedSlots) {
        const resolvedId = result.resolved.get(`${slot.date}-${slot.shift}-${slot.slotIndex}`) ?? (slot.resourceId as ResourceId);
        await createReservationEntry({ date: slot.date, resourceId: resolvedId, shift: slot.shift, slotIndex: slot.slotIndex, surgeonId: user.id, patients: [] });
      }
      setSelectedKeys(new Set());
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

  const handleProgramarSave = async (patients: Omit<PatientInBlock, "id" | "order">[], coSurgeonIds?: string[]) => {
    if (selectedSlots.length === 0) return;
    const result = resolveSlotsToSameRoom(selectedSlots, reservations, blockPlans);
    if (!result) {
      setNotification(null);
      setErrorNotification("No hay ningún quirófano con todos los huecos seleccionados libres. Seleccione huecos en el mismo quirófano o elija otra combinación.");
      setTimeout(() => setErrorNotification(null), 6000);
      return;
    }
    const patientsWithOrder = patients.map((p, i) => ({
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
      for (let idx = 0; idx < selectedSlots.length; idx++) {
        const slot = selectedSlots[idx]!;
        const resolvedId = result.resolved.get(`${slot.date}-${slot.shift}-${slot.slotIndex}`) ?? (slot.resourceId as ResourceId);
        const slotPatients = idx === 0 ? patientsWithOrder : [];
        await createReservationEntry({ date: slot.date, resourceId: resolvedId, shift: slot.shift, slotIndex: slot.slotIndex, surgeonId: user.id, patients: slotPatients });
      }
      setSelectedKeys(new Set());
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
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ribera-navy)]">Estado del bloque</h1>
            <p className="mt-1 text-sm text-gray-600">
              Bloque Quirúrgico Covadonga · {user.name}
              {isGestorAnestesista && (
                <> · <button type="button" onClick={() => router.push("/calendario")} className="font-medium text-[var(--ribera-navy)] hover:underline">Ir a Calendario</button></>
              )}
              {" · "}
              <button type="button" onClick={() => { logout(); router.replace("/"); }} className="font-medium text-[var(--ribera-red)] hover:underline">Cerrar sesión</button>
            </p>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
            <nav className="flex gap-2 flex-nowrap sm:flex-wrap pb-2 sm:pb-0 [&_button]:shrink-0">
            {isGestorAnestesista && (
              <button
                type="button"
                onClick={() => router.push("/calendario")}
                className="rounded-lg border-2 border-[var(--ribera-navy)] px-4 py-2 text-sm font-medium text-[var(--ribera-navy)] hover:bg-[var(--ribera-navy)]/10"
              >
                ← Calendario
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab("bloque")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "bloque" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Reservar / programar
            </button>
            <button
              type="button"
              onClick={() => setTab("pacientes")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "pacientes" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Mis pacientes
            </button>
            <button
              type="button"
              onClick={() => setTab("historico")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "historico" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Histórico
            </button>
            <button
              type="button"
              onClick={() => setTab("normas")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "normas" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Normas de programación
            </button>
            <button
              type="button"
              onClick={() => setTab("liberaciones")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "liberaciones" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Últimas liberaciones
            </button>
            <button
              type="button"
              onClick={() => setTab("coordinacion")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "coordinacion" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Contactar coordinación
            </button>
            <button
              type="button"
              onClick={() => setTab("perfil")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "perfil" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}
            >
              Mi perfil
            </button>
            </nav>
          </div>
        </header>

        {reservationsLoading && tab === "bloque" && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-600" role="status">
            Cargando reservas…
          </div>
        )}
        {errorNotification && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
            {errorNotification}
          </div>
        )}
        {notification && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status" aria-live="polite">
            {notification}
          </div>
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
              Pacientes programados en sus reservas.
            </p>
            {misPacientesProgramados.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">Aún no tiene pacientes programados. En la pestaña <strong>Reservar / programar</strong>, elija huecos en el calendario y pulse <strong>Reservar y programar pacientes</strong> para añadirlos.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Sala</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Turno</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Paciente / Nº historia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Procedimiento</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duración</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Anestesia</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Entidad</th>
                      {canCancelPatient && <th className="px-3 py-2 text-left font-semibold text-gray-700">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {misPacientesProgramados.map(({ date, resourceLabel, shift, patient, reservationId }) => {
                      const isLastPatient = misPacientesProgramados.filter((p) => p.reservationId === reservationId).length === 1;
                      const retentionAllowed = isReservationRetentionStillAllowed(date);
                      return (
                        <tr key={`${date}-${resourceLabel}-${shift}-${patient.id}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-800">{new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-3 py-2 text-gray-800">{resourceLabel}</td>
                          <td className="px-3 py-2 text-gray-800">{shift === "morning" ? "Mañana" : "Tarde"}</td>
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
            <p className="text-sm text-gray-600">
              Elija un día y los huecos para reservar o programar pacientes.
            </p>
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
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Para esta semana (a partir del jueves) solo puede <strong>programar pacientes directamente</strong> en huecos libres; no puede reservar huecos vacíos.
                      </div>
                    )}
                    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
                      <p className="text-xs text-gray-600">
                        <span className="inline-block h-3.5 w-3.5 rounded border border-emerald-300 bg-emerald-100 align-middle" /> Libre
                        <span className="mx-2">·</span>
                        <span className="inline-block h-3.5 w-3.5 rounded border border-red-300 bg-red-100 align-middle" /> Ocupado
                        <span className="mx-2">·</span>
                        <span className="inline-block h-3.5 w-3.5 rounded border border-amber-400 bg-amber-200 align-middle" /> Reservado por usted
                        <span className="mx-2">·</span>
                        <span className="inline-block h-3.5 w-3.5 rounded border border-gray-300 bg-white align-middle" /> Con pacientes
                      </p>
                    </div>

                    {selectedKeys.size > 0 && (
                      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--ribera-red)]/30 bg-ribera-red-pale p-4">
                        <span className="text-sm font-medium text-gray-800">
                          {selectedKeys.size} hueco(s) · {totalReservedMinutes} min
                        </span>
                        <button type="button" onClick={() => setShowProgramarModal(true)} className="btn-ribera-primary" disabled={savingReservations}>
                          Reservar y programar pacientes
                        </button>
                        {!hasClosedWeekSlot && (
                          <button type="button" onClick={handleSoloReservar} className="btn-ribera-outline" disabled={savingReservations}>
                            Solo reservar
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedKeys(new Set())} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                          Cancelar
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

      {showProgramarModal && selectedSlots.length > 0 && (
<ProgramarPacientesModal
        slots={selectedSlots}
        currentUserId={user.id}
        onSave={handleProgramarSave}
        onClose={() => setShowProgramarModal(false)}
        saving={savingReservations}
      />
      )}
    </div>
  );
}
