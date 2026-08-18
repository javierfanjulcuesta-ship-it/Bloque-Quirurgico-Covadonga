"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { getUsers } from "@/lib/dataHelpers";
import { getReservations, updateReservationPatientEntry } from "@/lib/reservations";
import type { Reservation } from "@/lib/types";
import { hasGestionCitasAccess } from "@/lib/types";
import {
  buildGestionCitasRows,
  nextWorkingWeekBounds,
  type AuthorizationOperationalStatus,
  type ConfirmationOperationalStatus,
} from "@/lib/gestionCitas";
import {
  getDemoGestionCitasState,
  registerDemoGestionCitasAttempt,
  updateDemoGestionCitasPatient,
  type DemoGestionCitasState,
} from "@/lib/demoGestionCitasState";
import { InlineNotice } from "@/components/ui/InlineNotice";

const CONFIRMATION_OPTIONS: Array<{ value: ConfirmationOperationalStatus; label: string }> = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "CONFIRMADO_CON_PACIENTE", label: "Confirmado con paciente" },
  { value: "NO_LOCALIZADO", label: "No localizado" },
  { value: "REQUIERE_NUEVA_LLAMADA", label: "Requiere nueva llamada" },
  { value: "INCIDENCIA", label: "Incidencia" },
];

const AUTH_OPTIONS: Array<Exclude<AuthorizationOperationalStatus, "NO_PRECISA">> = ["PENDIENTE", "APROBADA", "DENEGADA"];

function formatDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
}

function formatAppointment(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function daysUntil(ymd: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const surgery = new Date(`${ymd}T00:00:00`);
  return Math.ceil((surgery.getTime() - today.getTime()) / 86_400_000);
}

function statusClass(status: string): string {
  if (status === "LISTO" || status === "APTO" || status === "APROBADA" || status === "NO_PRECISA" || status === "CONFIRMADO_CON_PACIENTE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "REQUIERE_ATENCION" || status === "NO_APTO" || status === "DENEGADA" || status === "INCIDENCIA") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function GestionCitasPage() {
  const router = useRouter();
  const { user, hydrated, logout } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [overlays, setOverlays] = useState<DemoGestionCitasState>({});
  const [tab, setTab] = useState<"next" | "all">("next");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestionCitasAccess(user.role)) {
      router.replace("/");
      return;
    }
    if (!modoDemo) {
      setLoading(false);
      return;
    }

    setOverlays(getDemoGestionCitasState());
    getReservations()
      .then(setReservations)
      .catch(() => setError("No se pudo cargar la lista operativa."))
      .finally(() => setLoading(false));
  }, [hydrated, user, router]);

  const allRows = useMemo(() => buildGestionCitasRows(reservations, overlays), [reservations, overlays]);
  const bounds = useMemo(() => nextWorkingWeekBounds(), []);
  const nextRows = useMemo(
    () => allRows.filter((row) => row.surgeryDate >= bounds.from && row.surgeryDate <= bounds.to),
    [allRows, bounds],
  );
  const rows = tab === "next" ? nextRows : allRows;
  const users = getUsers();
  const surgeonName = (id: string) => users.find((u) => u.id === id)?.name ?? "Profesional responsable";

  const summary = useMemo(() => ({
    total: nextRows.length,
    attention: nextRows.filter((r) => r.globalStatus === "REQUIERE_ATENCION").length,
    callPending: nextRows.filter((r) => r.confirmationStatus !== "CONFIRMADO_CON_PACIENTE").length,
    prePending: nextRows.filter((r) => r.preanesthesiaStatus === "PENDIENTE_CON_CITA" || r.preanesthesiaStatus === "PENDIENTE_SIN_CITA").length,
    authPending: nextRows.filter((r) => r.authorizationStatus === "PENDIENTE" || r.authorizationStatus === "DENEGADA").length,
    ready: nextRows.filter((r) => r.globalStatus === "LISTO").length,
  }), [nextRows]);

  const reloadReservations = async () => setReservations(await getReservations());

  const startContactEdit = (patientId: string, patientPhone?: string, patientEmail?: string) => {
    setEditingContact(patientId);
    setPhone(patientPhone ?? "");
    setEmail(patientEmail ?? "");
  };

  const saveContact = async (reservationId: string, patientId: string) => {
    setError("");
    try {
      await updateReservationPatientEntry({ reservationId, patientId, patientPhone: phone, patientEmail: email });
      await reloadReservations();
      setEditingContact(null);
    } catch {
      setError("No se pudo guardar el teléfono/email en la DEMO.");
    }
  };

  const changeConfirmation = (patientId: string, status: ConfirmationOperationalStatus) => {
    const next = status === "PENDIENTE"
      ? updateDemoGestionCitasPatient(patientId, { confirmationStatus: status })
      : registerDemoGestionCitasAttempt(patientId, status);
    setOverlays(next);
  };

  const changeAuthorization = (patientId: string, status: Exclude<AuthorizationOperationalStatus, "NO_PRECISA">) => {
    setOverlays(updateDemoGestionCitasPatient(patientId, { authorizationStatus: status }));
  };

  if (!hydrated || loading) {
    return <div className="mx-auto max-w-7xl p-6 text-sm text-slate-600">Cargando Gestión de citas…</div>;
  }

  if (!user || !hasGestionCitasAccess(user.role)) return null;

  if (!modoDemo) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <InlineNotice variant="warning">
          El perfil de Gestión de citas está habilitado, pero su backend real todavía no está conectado. Esta pantalla no reutiliza APIs de gestor ni de anestesia por seguridad.
        </InlineNotice>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Gestión de citas · DEMO</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Preparación de pacientes</h1>
          <p className="mt-1 text-sm text-slate-600">Espacio operativo independiente. Sin funciones clínicas, de anestesia ni de reserva de quirófano.</p>
        </div>
        <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar sesión</button>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Semana siguiente · Preparación de pacientes</h2>
            <p className="text-sm text-slate-500">Lunes {formatDate(bounds.from)} → viernes {formatDate(bounds.to)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setTab("next")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "next" ? "bg-[var(--ribera-navy)] text-white" : "bg-slate-100 text-slate-700"}`}>Semana siguiente</button>
            <button type="button" onClick={() => setTab("all")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "all" ? "bg-[var(--ribera-navy)] text-white" : "bg-slate-100 text-slate-700"}`}>Todos los pacientes</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            ["Total", summary.total],
            ["Atención prioritaria", summary.attention],
            ["Llamada pendiente", summary.callPending],
            ["Preanestesia pendiente", summary.prePending],
            ["Autorización", summary.authPending],
            ["Listos", summary.ready],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {error && <InlineNotice variant="error" className="mb-4">{error}</InlineNotice>}

      {rows.length === 0 ? (
        <InlineNotice variant="info">
          No hay pacientes en esta vista. En la pantalla de acceso puede usar “Cargar datos de ejemplo”; la siguiente iteración ampliará el seed con una semana siguiente completa.
        </InlineNotice>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const editing = editingContact === row.patientId;
            const d = daysUntil(row.surgeryDate);
            return (
              <article key={row.patientId} className={`rounded-xl border bg-white p-4 shadow-sm ${row.globalStatus === "REQUIERE_ATENCION" ? "border-red-300" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{row.patientName}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.globalStatus)}`}>{row.globalStatus === "REQUIERE_ATENCION" ? "REQUIERE ATENCIÓN" : row.globalStatus}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{d >= 0 ? `${d} días` : "Intervención pasada"}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{formatDate(row.surgeryDate)} · {row.surgeryTime} · {row.resourceId} · {surgeonName(row.surgeonId)}</p>
                    <p className="text-sm text-slate-600">{row.procedure}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">Intentos de contacto: <strong>{row.attemptCount}</strong></div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto</p>
                    {editing ? (
                      <div className="mt-2 space-y-2">
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                        <div className="flex gap-2"><button type="button" onClick={() => void saveContact(row.reservationId, row.patientId)} className="rounded bg-[var(--ribera-navy)] px-2 py-1 text-xs font-medium text-white">Guardar</button><button type="button" onClick={() => setEditingContact(null)} className="rounded border border-slate-300 px-2 py-1 text-xs">Cancelar</button></div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-700">
                        <p>{row.patientPhone || <span className="font-medium text-red-700">Sin teléfono</span>}</p>
                        <p>{row.patientEmail || <span className="font-medium text-amber-700">Sin email</span>}</p>
                        <button type="button" onClick={() => startContactEdit(row.patientId, row.patientPhone, row.patientEmail)} className="mt-2 text-xs font-medium text-[var(--ribera-red)] hover:underline">Editar teléfono/email</button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmación telefónica</p>
                    <select value={row.confirmationStatus} onChange={(e) => changeConfirmation(row.patientId, e.target.value as ConfirmationOperationalStatus)} className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      {CONFIRMATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preanestesia</p>
                    <span className={`mt-2 inline-block rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.preanesthesiaStatus)}`}>{row.preanesthesiaStatus.replaceAll("_", " ")}</span>
                    {row.preanesthesiaAppointmentAt && row.preanesthesiaStatus === "PENDIENTE_CON_CITA" && <p className="mt-2 text-xs text-slate-600">Cita: {formatAppointment(row.preanesthesiaAppointmentAt)}</p>}
                    {row.preanesthesiaStatus === "NO_PRECISA" && <p className="mt-2 text-xs text-slate-600">Anestesia local sin anestesista. No se considera APTO.</p>}
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Autorización</p>
                    {row.authorizationStatus === "NO_PRECISA" ? (
                      <span className={`mt-2 inline-block rounded-full border px-2 py-1 text-xs font-semibold ${statusClass("NO_PRECISA")}`}>NO PRECISA · privado</span>
                    ) : (
                      <select value={row.authorizationStatus} onChange={(e) => changeAuthorization(row.patientId, e.target.value as Exclude<AuthorizationOperationalStatus, "NO_PRECISA">)} className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                        {AUTH_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {row.reasons.length > 0 && <p className="mt-3 text-xs text-slate-500">Pendiente: {row.reasons.join(" · ")}</p>}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
