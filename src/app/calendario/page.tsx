"use client";

/**
 * Página de demostración del calendario V2: rangos horarios, días, colores (libre/reservado/ocupado)
 * y vista gestor con pacientes privados remarcados.
 * Para ver el estado actual de la V2: http://localhost:3000/calendario
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { roleLabel, hasGestorAccess } from "@/lib/types";
import { hasPermission } from "@/lib/auth/permissions";
import { getAllowedResourcesForRole, RESOURCES } from "@/lib/constants";
import { ASSIGNMENT_FULL_SHIFT } from "@/lib/types";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { getStoredReservations, getMessagesToGestor } from "@/lib/storageMensajesYNotificaciones";
import { fetchBlockPlans } from "@/lib/api/blockOpeningPlan";
import { getReservations, ReservationsApiError } from "@/lib/reservations";
import { getAssignments } from "@/lib/anesthetistAssignments";
import { buildSlotViews, getUsers } from "@/lib/dataHelpers";
import { modoDemo } from "@/lib/config";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { WeekGridCalendar } from "@/components/calendar/WeekGridCalendar";
import { DaySlotGrid } from "@/components/calendar/DaySlotGrid";
import { VistaSemanal } from "@/components/gestor/VistaSemanal";
import { ConsultaPreanestesiaRow } from "@/components/calendar/ConsultaPreanestesiaRow";
import { MiPerfil } from "@/components/MiPerfil";
import { ContactarCoordinacion } from "@/components/ContactarCoordinacion";
import { HistoricoView } from "@/components/HistoricoView";
import { CrearNuevoUsuario } from "@/components/gestor/CrearNuevoUsuario";
import { ListaUsuariosGestor } from "@/components/gestor/ListaUsuariosGestor";
import { AsignarAnestesistas } from "@/components/gestor/AsignarAnestesistas";
import { GestionarApertura } from "@/components/gestor/GestionarApertura";
import { NormasGestorView } from "@/components/gestor/NormasGestorView";
import { ValoracionPreanestesia } from "@/components/anestesista/ValoracionPreanestesia";
import { MiProgramacion } from "@/components/anestesista/MiProgramacion";
import { SolicitarNoDisponibilidad } from "@/components/anestesista/SolicitarNoDisponibilidad";
import type { Reservation } from "@/lib/types";
import { hasAnesthetistAccess } from "@/lib/types";

const RESERVATIONS_STORAGE_KEY = "bloque_quirurgico_reservations";

export default function CalendarioPage() {
  const router = useRouter();
  const { user, logout, hydrated } = useAuth();
  type TabId = "calendario" | "perfil" | "coordinacion" | "gestion-usuarios" | "asignar-anestesistas" | "gestionar-apertura" | "normas" | "mensajes" | "consulta-preanestesia" | "mi-programacion" | "solicitar-no-disponibilidad" | "historico";
  const [viewTab, setViewTab] = useState<TabId>("calendario");
  const isAnestesista = user ? hasAnesthetistAccess(user.role) : false;
  const [selectedDateForGrid, setSelectedDateForGrid] = useState<Date | null>(null);
  const [calendarPeriodStart, setCalendarPeriodStart] = useState(() => getWeekStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [anesthetistAssignments, setAnesthetistAssignments] = useState<Array<{ date: string; shift: string; assignmentType: string; resourceId: string }>>([]);
  const [contactMessages, setContactMessages] = useState<Array<{ id: string; fromName: string; fromEmail: string; subject: string; body: string; date: string }>>([]);
  const [contactMessagesLoading, setContactMessagesLoading] = useState(false);
  const [blockPlans, setBlockPlans] = useState<import("@/lib/types").BlockOpeningPlan[]>([]);

  const refreshContactMessages = useCallback(async () => {
    if (modoDemo) return;
    setContactMessagesLoading(true);
    try {
      const res = await fetch("/api/contact", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray((data as { messages?: unknown[] }).messages)) {
        setContactMessages((data as { messages: Array<{ id: string; fromName: string; fromEmail: string; subject: string; body: string; date: string }> }).messages);
      }
    } finally {
      setContactMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    const gestor = user ? hasGestorAccess(user.role) : false;
    if (!modoDemo && gestor && viewTab === "mensajes") refreshContactMessages();
  }, [modoDemo, user, viewTab, refreshContactMessages]);

  const refreshReservations = useCallback(async () => {
    if (modoDemo) {
      setReservations(getStoredReservations());
      setReservationsError(null);
      return;
    }
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const from = new Date(calendarPeriodStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(calendarPeriodStart);
      to.setDate(to.getDate() + 5 * 7 + 6);
      const list = await getReservations({
        dateFrom: toISODate(from),
        dateTo: toISODate(to),
      });
      setReservations(list);
    } catch (err) {
      const msg = err instanceof ReservationsApiError ? err.message : "Error al cargar reservas";
      setReservationsError(msg);
      setReservations([]);
    } finally {
      setReservationsLoading(false);
    }
  }, [modoDemo, calendarPeriodStart]);

  useEffect(() => {
    refreshReservations();
  }, [refreshReservations]);

  const refreshBlockPlans = useCallback(async () => {
    if (modoDemo) return;
    try {
      const from = new Date(calendarPeriodStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(calendarPeriodStart);
      to.setDate(to.getDate() + 5 * 7 + 6);
      const plans = await fetchBlockPlans({
        dateFrom: toISODate(from),
        dateTo: toISODate(to),
      });
      setBlockPlans(plans);
    } catch {
      setBlockPlans([]);
    }
  }, [modoDemo, calendarPeriodStart]);

  useEffect(() => {
    refreshBlockPlans();
  }, [refreshBlockPlans]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role === "cirujano" || user.role === "endoscopista") {
      router.replace("/cirujano");
      return;
    }
  }, [user, hydrated, router]);

  useEffect(() => {
    if (viewTab !== "calendario") return;
    refreshReservations();
  }, [viewTab, refreshReservations]);

  useEffect(() => {
    if (!modoDemo) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === RESERVATIONS_STORAGE_KEY) refreshReservations();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [modoDemo, refreshReservations]);

  useEffect(() => {
    if (modoDemo) return;
    const onFocus = () => refreshReservations();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [modoDemo, refreshReservations]);

  useEffect(() => {
    if (!modoDemo && isAnestesista && user?.id && selectedDateForGrid) {
      const from = new Date(selectedDateForGrid);
      from.setDate(from.getDate() - 7);
      const to = new Date(selectedDateForGrid);
      to.setDate(to.getDate() + 7);
      getAssignments({
        anesthetistId: user.id,
        dateFrom: toISODate(from),
        dateTo: toISODate(to),
      })
        .then((list) =>
          setAnesthetistAssignments(
            list.map((a) => ({ date: a.date, shift: a.shift, assignmentType: a.assignmentType, resourceId: a.resourceId }))
          )
        )
        .catch(() => setAnesthetistAssignments([]));
    } else {
      setAnesthetistAssignments([]);
    }
  }, [modoDemo, isAnestesista, user?.id, selectedDateForGrid]);

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  const isGestor = user ? hasGestorAccess(user.role) : false;
  const canManageUsers = user ? hasPermission(user.role, "user:create") : false;
  const canListUsers = user ? hasPermission(user.role, "user:list") : false;
  const allowedResourceIds = user ? getAllowedResourcesForRole(user.role) : undefined;

  const slotViews = useMemo(
    () =>
      buildSlotViews(weekStart, reservations, {
        asGestor: isGestor,
        currentUserId: user?.id,
        users: getUsers(),
        blockPlans,
        asGestorForBlocks: isGestor,
      }),
    [weekStart, reservations, isGestor, user?.id, blockPlans]
  );

  /** Vista del día seleccionado: columnas = recursos, filas = rangos (gestor/anestesista) */
  const allowedResources = useMemo(
    () => (allowedResourceIds ? RESOURCES.filter((r) => allowedResourceIds.includes(r.id)) : RESOURCES),
    [allowedResourceIds]
  );
  const slotViewsForSelectedDay = useMemo(() => {
    if (!selectedDateForGrid || !(isGestor || isAnestesista)) return [];
    const weekStartForDay = getWeekStart(selectedDateForGrid);
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      asGestor: true,
      blockPlans,
      asGestorForBlocks: isGestor,
      currentUserId: user?.id,
      users: getUsers(),
    });
    const dateStr = toISODate(selectedDateForGrid);
    let views = allViews.filter((v) => v.date === dateStr && allowedResources.some((r) => r.id === v.resourceId));
    if (isAnestesista && user?.id) {
      const assignedSet = new Set<string>();
      const orResourceIds = new Set(RESOURCES.map((r) => r.id));
      anesthetistAssignments
        .filter((a) => a.date === dateStr && a.assignmentType === "OR")
        .forEach((a) => {
          if (a.resourceId === ASSIGNMENT_FULL_SHIFT) {
            orResourceIds.forEach((rid) => assignedSet.add(`${a.date}|${a.shift}|${rid}`));
          } else {
            assignedSet.add(`${a.date}|${a.shift}|${a.resourceId}`);
          }
        });
      views = views.map((v) => ({
        ...v,
        assignedToAnesthetist: assignedSet.has(`${v.date}|${v.shift}|${v.resourceId}`),
      }));
    }
    return views;
  }, [selectedDateForGrid, reservations, user?.id, isGestor, isAnestesista, allowedResources, anesthetistAssignments, blockPlans]);

  /** Pacientes programados de la semana se asignan automáticamente a la consulta de preanestesia (lun y jue, mañana). */
  const preanesthesiaAssignedByDate = useMemo(() => {
    const weekDays = getWeekDays(weekStart);
    const from = toISODate(weekDays[0]);
    const to = toISODate(weekDays[weekDays.length - 1]!);
    let total = 0;
    reservations.forEach((r) => {
      if (r.date >= from && r.date <= to && r.patients?.length) total += r.patients.length;
    });
    const mon = toISODate(weekDays[0]!);
    const thu = weekDays.length > 3 ? toISODate(weekDays[3]!) : mon;
    return { [mon]: total, [thu]: total } as Record<string, number>;
  }, [weekStart, reservations]);

  if (!hydrated || !user || user.role === "cirujano" || user.role === "endoscopista") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="border-b border-gray-200 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--ribera-navy)]">Calendario</h1>
              <p className="mt-1 text-sm text-gray-600">
                Bloque Quirúrgico Covadonga
                {user && (
                  <> · {roleLabel(user.role)} · {user.name} · <button type="button" onClick={handleLogout} className="font-medium text-[var(--ribera-red)] hover:underline">Cerrar sesión</button></>
                )}
              </p>
            </div>
            {user && (
              <nav className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewTab("calendario")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "calendario" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Calendario
                </button>
                {hasAnesthetistAccess(user?.role ?? "") && isGestor && (
                  <button type="button" onClick={() => router.push("/cirujano")} className="rounded-lg px-4 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50">
                    Reservar / programar
                  </button>
                )}
                {(isGestor || canManageUsers) && (
                  <>
                    <button type="button" onClick={() => setViewTab("mensajes")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "mensajes" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Mensajes
                    </button>
                    {(canListUsers || canManageUsers) && (
                    <button type="button" onClick={() => setViewTab("gestion-usuarios")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "gestion-usuarios" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Gestión de usuarios
                    </button>
                    )}
                    {isGestor && (
                    <>
                    <button type="button" onClick={() => setViewTab("asignar-anestesistas")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "asignar-anestesistas" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Asignar anestesistas
                    </button>
                    <button type="button" onClick={() => setViewTab("gestionar-apertura")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "gestionar-apertura" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Apertura bloque
                    </button>
                    <button type="button" onClick={() => setViewTab("normas")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "normas" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Normas
                    </button>
                    </>
                    )}
                  </>
                )}
                {isAnestesista && (
                  <>
                    <button type="button" onClick={() => setViewTab("mi-programacion")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "mi-programacion" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Mi programación
                    </button>
                    <button type="button" onClick={() => setViewTab("solicitar-no-disponibilidad")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "solicitar-no-disponibilidad" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Solicitar no disponibilidad
                    </button>
                    <button type="button" onClick={() => setViewTab("consulta-preanestesia")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "consulta-preanestesia" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Consulta preanestesia
                    </button>
                    <button type="button" onClick={() => setViewTab("historico")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "historico" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                      Histórico
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setViewTab("coordinacion")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "coordinacion" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Contactar coordinación
                </button>
                <button type="button" onClick={() => setViewTab("perfil")} className={`rounded-lg px-4 py-2 text-sm font-medium ${viewTab === "perfil" ? "bg-[var(--ribera-red)] text-white" : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                  Mi perfil
                </button>
              </nav>
            )}
          </div>
          {viewTab === "calendario" && (
            <>
              <p className="mt-2 text-sm text-gray-600">
                Elija un día para ver el estado del bloque. Privados en naranja, SESPA en rosa.
              </p>
              {reservationsError && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {reservationsError}
                </p>
              )}
            </>
          )}
        </header>

        {user && viewTab === "perfil" && (
          <MiPerfil user={user} />
        )}

        {user && viewTab === "coordinacion" && (
          <ContactarCoordinacion user={user} />
        )}

        {user && isAnestesista && viewTab === "mi-programacion" && (
          <MiProgramacion anesthetistId={user.id} reservations={reservations} />
        )}

        {user && isAnestesista && viewTab === "solicitar-no-disponibilidad" && (
          <SolicitarNoDisponibilidad anesthetistId={user.id} />
        )}

        {user && isAnestesista && viewTab === "consulta-preanestesia" && (
          <ValoracionPreanestesia reservations={reservations} />
        )}

        {user && (canListUsers || canManageUsers) && viewTab === "gestion-usuarios" && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {canManageUsers && (
              <div className="min-w-0 shrink-0 lg:w-[380px]">
                <CrearNuevoUsuario />
              </div>
            )}
            {canListUsers && (
              <section className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-1 text-xl font-bold text-[var(--ribera-navy)]">Gestión de usuarios</h2>
                <p className="mb-4 text-sm text-gray-600">
                  Listar, desactivar, reactivar y reenviar invitaciones
                </p>
                <ListaUsuariosGestor />
              </section>
            )}
          </div>
        )}

        {user && isGestor && viewTab === "asignar-anestesistas" && (
          <AsignarAnestesistas reservations={reservations} />
        )}

        {user && isGestor && viewTab === "gestionar-apertura" && (
          <GestionarApertura reservations={reservations} />
        )}

        {user && isGestor && viewTab === "normas" && (
          <NormasGestorView />
        )}

        {user && isGestor && viewTab === "mensajes" && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Mensajes</h2>
            <p className="mb-4 text-sm text-gray-600">
              Mensajes desde Contactar coordinación y pantalla de acceso.
            </p>
            {contactMessagesLoading && !modoDemo ? (
              <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">Cargando mensajes…</p>
            ) : (
              <div className="space-y-4">
                {(modoDemo ? getMessagesToGestor() : contactMessages).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500">
                    No hay mensajes recibidos. Los usuarios pueden enviarlos desde <strong>Contactar coordinación</strong> o desde la pantalla de acceso.
                  </p>
                ) : (
                  (modoDemo ? getMessagesToGestor() : contactMessages).map((msg) => (
                    <article key={msg.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--ribera-navy)]">{msg.fromName}</span>
                        {msg.fromEmail && <span className="text-sm text-gray-500">{msg.fromEmail}</span>}
                        <span className="text-sm text-gray-400">{new Date(msg.date).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                      <h3 className="mb-1 font-medium text-gray-800">{msg.subject}</h3>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{msg.body}</p>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {user && viewTab === "historico" && (
          <HistoricoView user={user} reservations={reservations} />
        )}

        {viewTab === "calendario" && (
          <>
            {reservationsLoading && !modoDemo && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
                Cargando reservas…
              </p>
            )}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="shrink-0">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-[var(--ribera-navy)]">Elija un día</p>
                  <WeekGridCalendar
                    periodStart={calendarPeriodStart}
                    onPeriodChange={setCalendarPeriodStart}
                    onSelectDay={(date) => {
                      setSelectedDateForGrid(date);
                      setWeekStart(getWeekStart(date));
                    }}
                    selectedDate={selectedDateForGrid}
                  />
                  <button
                    type="button"
                    onClick={() => { setReservationsError(null); refreshReservations(); }}
                    disabled={reservationsLoading}
                    className="mt-3 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Actualizar la lista de reservas mostrada"
                  >
                    {reservationsLoading ? "Cargando…" : "Refrescar calendario"}
                  </button>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                {selectedDateForGrid ? (
                  <>
                    {(isGestor || isAnestesista) && (
                      <>
                        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                          <p className="text-sm font-semibold text-gray-800">
                            {selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Verde: libre · Amarillo: reservado · Blanco: con pacientes · Naranja: privado
                          </p>
                        </div>
                        <section className="mb-6">
                          <DaySlotGrid
                            date={selectedDateForGrid}
                            dateLabel={selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                            allowedResources={allowedResources}
                            slotViews={slotViewsForSelectedDay}
                          />
                        </section>
                        <section className="mb-6">
                          <h2 className="mb-2 text-base font-semibold text-gray-800">Consulta de preanestesia</h2>
                          <p className="mb-2 text-xs text-gray-500">Lun y jue, mañana. Pacientes de la semana asignados automáticamente.</p>
                          <ConsultaPreanestesiaRow weekStart={weekStart} assignedByDate={preanesthesiaAssignedByDate} />
                        </section>
                        <section>
                          <h2 className="mb-2 text-base font-semibold text-gray-800">Reservas de la semana</h2>
                          {reservations.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-gray-500">
                              No hay reservas. Los cirujanos y endoscopistas pueden crearlas desde el panel <strong>Estado del bloque</strong> (Reservar / programar).
                            </p>
                          ) : (
                            <VistaSemanal storedReservations={reservations} />
                          )}
                        </section>
                      </>
                    )}

                    {!isGestor && !isAnestesista && (
                      <section className="mb-6">
                        <h2 className="mb-2 text-lg font-semibold text-gray-800">Calendario semanal</h2>
                        <WeekCalendar
                          weekStart={weekStart}
                          onWeekChange={setWeekStart}
                          slotViews={slotViews}
                          showDetails={false}
                          canScheduleNextWeek={true}
                          allowedResourceIds={allowedResourceIds}
                        />
                      </section>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 px-6 text-center">
                    <p className="mb-1 text-lg font-medium text-gray-700">Elija un día</p>
                    <p className="text-sm text-gray-500">Seleccione una fecha en el calendario para ver el estado del bloque y la programación.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
