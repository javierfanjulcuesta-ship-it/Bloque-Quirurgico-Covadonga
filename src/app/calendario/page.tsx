"use client";

/**
 * Página de demostración del calendario V2: rangos horarios, días, colores (libre/reservado/ocupado)
 * y vista gestor con pacientes privados remarcados.
 * Para ver el estado actual de la V2: http://localhost:3000/calendario
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/context/UsersContext";
import { roleLabel, hasGestorAccess } from "@/lib/types";
import { hasPermission } from "@/lib/auth/permissions";
import { getAllowedResourcesForRole, RESOURCES } from "@/lib/constants";
import { ASSIGNMENT_FULL_SHIFT } from "@/lib/types";
import { getWeekStart, getWeekDays, toISODate } from "@/lib/utils";
import { getStoredReservations, getMessagesToGestor } from "@/lib/storageMensajesYNotificaciones";
import { getReservations, ReservationsApiError } from "@/lib/reservations";
import { getAssignments } from "@/lib/anesthetistAssignments";
import { buildSlotViews } from "@/lib/dataHelpers";
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
import { NormasGestorView } from "@/components/gestor/NormasGestorView";
import { CuadroDeMando } from "@/components/gestor/CuadroDeMando";
import { ValoracionPreanestesia } from "@/components/anestesista/ValoracionPreanestesia";
import { MiProgramacion } from "@/components/anestesista/MiProgramacion";
import { SolicitarNoDisponibilidad } from "@/components/anestesista/SolicitarNoDisponibilidad";
import type { AnesthetistAssignment, BlockOpeningPlan, Reservation } from "@/lib/types";
import { hasAnesthetistAccess } from "@/lib/types";
import { PageShellHeader } from "@/components/ui/PageShellHeader";
import { AppNavTab } from "@/components/ui/AppNavTab";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { CalendarStateLegend } from "@/components/ui/CalendarStateLegend";
import { WorkspaceQuickActions } from "@/components/ui/WorkspaceQuickActions";

const RESERVATIONS_STORAGE_KEY = "bloque_quirurgico_reservations";

function canViewDashboard(user: { role?: string } | null | undefined): boolean {
  const role = (user?.role ?? "").trim().toLowerCase().replace(/_/g, "-");
  return role === "gestor" || role === "gestor-anestesista";
}

type CalendarioViewTab =
  | "calendario"
  | "perfil"
  | "coordinacion"
  | "gestion-usuarios"
  | "asignar-anestesistas"
  | "gestionar-apertura"
  | "normas"
  | "mensajes"
  | "consulta-preanestesia"
  | "mi-programacion"
  | "solicitar-no-disponibilidad"
  | "historico"
  | "cuadro-de-mando";

function getCalendarioScreenContext(
  tab: CalendarioViewTab,
  opts: { isGestor: boolean; isAnestesista: boolean }
): { title: string; subtitle: string } {
  const { isGestor, isAnestesista } = opts;
  switch (tab) {
    case "calendario":
      return {
        title: "Calendario del bloque",
        subtitle: isGestor
          ? "Vista global del quirófano: día, preanestesia y resumen semanal. La leyenda describe los colores de cada hueco."
          : isAnestesista
          ? "Consulte la ocupación y los huecos donde figura asignado. El resto de tareas están en las pestañas superiores."
          : "Consulte la actividad del bloque según los permisos asociados a su rol.",
      };
    case "perfil":
      return { title: "Mi perfil", subtitle: "Datos de su cuenta y preferencias en la aplicación." };
    case "coordinacion":
      return { title: "Contactar coordinación", subtitle: "Envíe un mensaje al equipo de coordinación del bloque." };
    case "gestion-usuarios":
      return { title: "Gestión de usuarios", subtitle: "Alta de cuentas, listado, invitaciones y activación." };
    case "asignar-anestesistas":
      return {
        title: "Asignar anestesistas",
        subtitle: "Asigne profesionales por quirófano y turno; respete SESPA y el máximo de recursos por anestesista.",
      };
    case "gestionar-apertura":
      return { title: "Apertura del bloque", subtitle: "Gestión de planes de apertura y disponibilidad de recursos." };
    case "normas":
      return { title: "Normas", subtitle: "Criterios de programación y uso del bloque quirúrgico." };
    case "mensajes":
      return { title: "Mensajes", subtitle: "Bandeja de mensajes desde coordinación y la pantalla de acceso." };
    case "consulta-preanestesia":
      return { title: "Consulta de preanestesia", subtitle: "Valoración y listados según la programación del bloque." };
    case "mi-programacion":
      return { title: "Mi programación", subtitle: "Resumen de sus asignaciones y pacientes vinculados." };
    case "solicitar-no-disponibilidad":
      return { title: "Solicitar no disponibilidad", subtitle: "Indique franjas en las que no puede asumir asignaciones." };
    case "historico":
      return { title: "Histórico", subtitle: "Consulta de actividad registrada en el bloque." };
    case "cuadro-de-mando":
      return {
        title: "Cuadro de mando",
        subtitle: "Indicadores de capacidad y ocupación a partir de los huecos de la semana visible.",
      };
    default:
      return { title: "Calendario", subtitle: "" };
  }
}

export default function CalendarioPage() {
  const router = useRouter();
  const { user, logout, hydrated } = useAuth();
  /** Lista de usuarios del directorio (misma fuente que Asignar anestesistas). Debe estar en dependencias del calendario para recalcular nombres de cirujano tras /api/users. */
  const { users: usersDirectory } = useUsers();
  const [viewTab, setViewTab] = useState<CalendarioViewTab>("calendario");
  const isAnestesista = user ? hasAnesthetistAccess(user.role) : false;
  const [selectedDateForGrid, setSelectedDateForGrid] = useState<Date | null>(null);
  const [calendarPeriodStart, setCalendarPeriodStart] = useState(() => getWeekStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [lastReservationsFetchedAt, setLastReservationsFetchedAt] = useState<Date | null>(null);
  const [anesthetistAssignments, setAnesthetistAssignments] = useState<Array<{ date: string; shift: string; assignmentType: string; resourceId: string }>>([]);
  const [gestorOrAssignmentsForCuadro, setGestorOrAssignmentsForCuadro] = useState<AnesthetistAssignment[]>([]);
  const [contactMessages, setContactMessages] = useState<Array<{ id: string; fromName: string; fromEmail: string; subject: string; body: string; date: string }>>([]);
  const [contactMessagesLoading, setContactMessagesLoading] = useState(false);
  // Feature flag temporal: backend de apertura de bloque deshabilitado.
  const blockPlans: BlockOpeningPlan[] = [];

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

  /** Misma semana que el Cuadro de Mando y el periodo de carga de reservas (evita huecos fuera del rango API). */
  const navigateDashboardWeek = useCallback((targetWeekMonday: Date) => {
    const ws = getWeekStart(targetWeekMonday);
    setWeekStart(ws);
    setCalendarPeriodStart(ws);
    setSelectedDateForGrid(ws);
  }, []);

  const refreshReservations = useCallback(async () => {
    if (modoDemo) {
      setReservations(getStoredReservations());
      setLastReservationsFetchedAt(new Date());
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
      setLastReservationsFetchedAt(new Date());
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
  const canViewDashboardByRole = canViewDashboard(user);
  const canViewCuadroDeMando =
    !!user && canViewDashboardByRole && hasPermission(user.role, "metrics:view");

  useEffect(() => {
    if (!isGestor || !canViewCuadroDeMando || viewTab !== "cuadro-de-mando") {
      setGestorOrAssignmentsForCuadro([]);
      return;
    }
    const days = getWeekDays(weekStart);
    const dateFrom = toISODate(days[0]!);
    const dateTo = toISODate(days[days.length - 1]!);
    let cancelled = false;
    getAssignments({ dateFrom, dateTo })
      .then((list) => {
        if (cancelled) return;
        setGestorOrAssignmentsForCuadro(list.filter((a) => a.assignmentType === "OR"));
      })
      .catch(() => {
        if (!cancelled) setGestorOrAssignmentsForCuadro([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isGestor, canViewCuadroDeMando, viewTab, weekStart]);

  const canManageUsers = user ? hasPermission(user.role, "user:create") : false;
  const canListUsers = user ? hasPermission(user.role, "user:list") : false;
  const allowedResourceIds = user ? getAllowedResourcesForRole(user.role) : undefined;

  const screen = useMemo(
    () => getCalendarioScreenContext(viewTab, { isGestor, isAnestesista }),
    [viewTab, isGestor, isAnestesista]
  );
  const workspaceQuickActions = useMemo(() => {
    if (isGestor && isAnestesista) {
      return {
        title: "Espacio gestor-anestesista",
        subtitle: "Combina visión operativa global y seguimiento de actividad anestésica en un único entorno.",
        nextAction: viewTab === "calendario" ? "Revise hoy en Calendario y pase a Asignar anestesistas si hay huecos pendientes." : "Use los accesos rápidos para volver al módulo de trabajo principal.",
        actions: [
          { label: "Calendario del día", onClick: () => setViewTab("calendario"), primary: viewTab !== "calendario" },
          { label: "Asignar anestesistas", onClick: () => setViewTab("asignar-anestesistas"), primary: viewTab === "calendario" },
          { label: "Mi programación", onClick: () => setViewTab("mi-programacion") },
          { label: "Importar planificación", onClick: () => router.push("/importar-planificacion") },
          { label: "Reservar / programar", onClick: () => router.push("/cirujano") },
        ],
      };
    }
    if (isGestor) {
      return {
        title: "Espacio gestor",
        subtitle: "Vista global del bloque para coordinar reservas, asignaciones y seguimiento semanal.",
        nextAction: viewTab === "calendario" ? "Seleccione un día y revise reservas, preanestesia e infrautilización." : "Vuelva a Calendario para validar impacto de cambios operativos.",
        actions: [
          { label: "Calendario del día", onClick: () => setViewTab("calendario"), primary: true },
          { label: "Asignar anestesistas", onClick: () => setViewTab("asignar-anestesistas") },
          { label: "Importar planificación", onClick: () => router.push("/importar-planificacion") },
          { label: "Mensajes", onClick: () => setViewTab("mensajes") },
          { label: "Reservar / programar", onClick: () => router.push("/cirujano") },
        ],
      };
    }
    return {
      title: "Espacio anestesista",
      subtitle: "Área centrada en su agenda clínica, disponibilidad y consulta de preanestesia.",
      nextAction: viewTab === "mi-programacion" ? "Revise turnos asignados y después complete preanestesia o no disponibilidad si procede." : "Abra Mi programación para empezar la jornada.",
      actions: [
        { label: "Mi programación", onClick: () => setViewTab("mi-programacion"), primary: viewTab !== "mi-programacion" },
        { label: "Consulta preanestesia", onClick: () => setViewTab("consulta-preanestesia") },
        { label: "No disponibilidad", onClick: () => setViewTab("solicitar-no-disponibilidad") },
        { label: "Calendario", onClick: () => setViewTab("calendario") },
      ],
    };
  }, [isGestor, isAnestesista, viewTab, router]);

  const slotViews = useMemo(
    () =>
      buildSlotViews(weekStart, reservations, {
        asGestor: isGestor,
        currentUserId: user?.id,
        users: usersDirectory,
        blockPlans,
        asGestorForBlocks: isGestor,
      }),
    [weekStart, reservations, isGestor, user?.id, blockPlans, usersDirectory]
  );

  /** Vista del día seleccionado: columnas = recursos, filas = rangos (gestor/anestesista) */
  const allowedResources = useMemo(
    () => (allowedResourceIds ? RESOURCES.filter((r) => allowedResourceIds.includes(r.id)) : RESOURCES),
    [allowedResourceIds]
  );
  /** Mismo universo de huecos que la tabla del Cuadro de Mando (recursos permitidos por rol). */
  const slotViewsForCuadroDeMando = useMemo(() => {
    const ids = new Set(allowedResources.map((r) => r.id));
    return slotViews.filter((v) => ids.has(v.resourceId));
  }, [slotViews, allowedResources]);
  const slotViewsForSelectedDay = useMemo(() => {
    if (!selectedDateForGrid || !(isGestor || isAnestesista)) return [];
    const weekStartForDay = getWeekStart(selectedDateForGrid);
    const allViews = buildSlotViews(weekStartForDay, reservations, {
      asGestor: true,
      blockPlans,
      asGestorForBlocks: isGestor,
      currentUserId: user?.id,
      users: usersDirectory,
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
  }, [selectedDateForGrid, reservations, user?.id, isGestor, isAnestesista, allowedResources, anesthetistAssignments, blockPlans, usersDirectory]);

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
    <div className="min-h-screen bg-white p-4">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageShellHeader
          title={screen.title}
          subtitle={
            <>
              <span className="text-slate-500">Bloque Quirúrgico Covadonga</span>
              {screen.subtitle ? (
                <>
                  {" "}
                  <span className="text-slate-400">·</span> {screen.subtitle}
                </>
              ) : null}
            </>
          }
          roleBadge={roleLabel(user.role)}
          userLine={
            <>
              <span className="text-slate-700">{user.name}</span>
              <span className="mx-1.5 text-slate-400">·</span>
              <button type="button" onClick={handleLogout} className="font-medium text-[var(--ribera-red)] hover:underline">
                Cerrar sesión
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="Secciones principales">
              <AppNavTab active={viewTab === "calendario"} onClick={() => setViewTab("calendario")}>
                Calendario
              </AppNavTab>
              {isGestor && (
                <AppNavTab active={false} emphasized onClick={() => router.push("/cirujano")}>
                  Reservar / programar
                </AppNavTab>
              )}
              {(isGestor || canManageUsers) && (
                <>
                  <AppNavTab active={viewTab === "mensajes"} onClick={() => setViewTab("mensajes")}>
                    Mensajes
                  </AppNavTab>
                  {(canListUsers || canManageUsers) && (
                    <AppNavTab active={viewTab === "gestion-usuarios"} onClick={() => setViewTab("gestion-usuarios")}>
                      Gestión de usuarios
                    </AppNavTab>
                  )}
                  {isGestor && (
                    <>
                      <AppNavTab active={viewTab === "asignar-anestesistas"} onClick={() => setViewTab("asignar-anestesistas")}>
                        Asignar anestesistas
                      </AppNavTab>
                      <AppNavTab active={viewTab === "normas"} onClick={() => setViewTab("normas")}>
                        Normas
                      </AppNavTab>
                      {canViewCuadroDeMando && (
                        <AppNavTab active={viewTab === "cuadro-de-mando"} onClick={() => setViewTab("cuadro-de-mando")}>
                          Cuadro de Mando
                        </AppNavTab>
                      )}
                    </>
                  )}
                </>
              )}
              {isAnestesista && (
                <>
                  <AppNavTab active={viewTab === "mi-programacion"} onClick={() => setViewTab("mi-programacion")}>
                    Mi programación
                  </AppNavTab>
                  <AppNavTab
                    active={viewTab === "solicitar-no-disponibilidad"}
                    onClick={() => setViewTab("solicitar-no-disponibilidad")}
                  >
                    Solicitar no disponibilidad
                  </AppNavTab>
                  <AppNavTab active={viewTab === "consulta-preanestesia"} onClick={() => setViewTab("consulta-preanestesia")}>
                    Consulta preanestesia
                  </AppNavTab>
                  <AppNavTab active={viewTab === "historico"} onClick={() => setViewTab("historico")}>
                    Histórico
                  </AppNavTab>
                </>
              )}
              <AppNavTab active={viewTab === "coordinacion"} onClick={() => setViewTab("coordinacion")}>
                Contactar coordinación
              </AppNavTab>
              <AppNavTab active={viewTab === "perfil"} onClick={() => setViewTab("perfil")}>
                Mi perfil
              </AppNavTab>
            </nav>
            {viewTab === "calendario" && (
              <div className="space-y-2">
                <CalendarStateLegend variant="compact" showAnestesistaHint={isAnestesista} />
                {reservationsError ? <InlineNotice variant="error">{reservationsError}</InlineNotice> : null}
              </div>
            )}
          </div>
        </PageShellHeader>
        <WorkspaceQuickActions
          title={workspaceQuickActions.title}
          subtitle={workspaceQuickActions.subtitle}
          nextAction={workspaceQuickActions.nextAction}
          actions={workspaceQuickActions.actions}
        />

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

        {user && isGestor && viewTab === "normas" && (
          <NormasGestorView />
        )}

        {user && canViewCuadroDeMando && viewTab === "cuadro-de-mando" && (
          <CuadroDeMando
            slotViews={slotViewsForCuadroDeMando}
            weekStart={weekStart}
            onWeekStartChange={navigateDashboardWeek}
            lastReservationsFetchedAt={lastReservationsFetchedAt}
            resources={allowedResources}
            reservations={reservations}
            anesthetistAssignments={gestorOrAssignmentsForCuadro}
            usersDirectory={usersDirectory}
          />
        )}

        {user && viewTab === "cuadro-de-mando" && !canViewCuadroDeMando && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <p className="text-sm font-semibold text-amber-900">No tienes permisos para acceder al cuadro de mando.</p>
            <p className="mt-1 text-sm text-amber-900/90">
              Esta sección está disponible solo para perfiles de gestión.
            </p>
          </section>
        )}

        {user && isGestor && viewTab === "mensajes" && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-[var(--ribera-navy)]">Mensajes</h2>
            <p className="mb-4 text-sm text-gray-600">
              Mensajes desde Contactar coordinación y pantalla de acceso.
            </p>
            {contactMessagesLoading && !modoDemo ? (
              <InlineNotice variant="info">Cargando mensajes…</InlineNotice>
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
              <InlineNotice variant="info" className="mb-2">
                Cargando reservas…
              </InlineNotice>
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
                {lastReservationsFetchedAt ? (
                  <div className="sticky top-4 z-10 mb-3 flex justify-end">
                    <p
                      className="ml-auto rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"
                      aria-live="polite"
                    >
                      Calendario actualizado a las{" "}
                      {lastReservationsFetchedAt.toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ) : null}
                {selectedDateForGrid ? (
                  <>
                    {(isGestor || isAnestesista) && (
                      <>
                        <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <p className="text-sm font-semibold text-[var(--ribera-navy)]">
                            {selectedDateForGrid.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <CalendarStateLegend variant="compact" showAnestesistaHint={isAnestesista} />
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
                            <VistaSemanal storedReservations={reservations} addedUsers={usersDirectory} />
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
