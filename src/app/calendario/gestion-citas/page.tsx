"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { hasGestorAccess, type Reservation } from "@/lib/types";
import { getReservations } from "@/lib/reservations";
import { getDemoGestionCitasState } from "@/lib/demoGestionCitasState";
import { buildGestionCitasRows, nextWorkingWeekBounds, type GestionCitasRow } from "@/lib/gestionCitas";
import { getWeekDays, getWeekStart, toISODate } from "@/lib/utils";
import { InlineNotice } from "@/components/ui/InlineNotice";

interface Summary {
  total: number;
  confirmed: number;
  callPending: number;
  incidents: number;
  preanesthesiaIssues: number;
  authorizationPending: number;
  authorizationDenied: number;
  ready: number;
}

function summarize(rows: GestionCitasRow[]): Summary {
  return {
    total: rows.length,
    confirmed: rows.filter((row) => row.confirmationStatus === "CONFIRMADO_CON_PACIENTE").length,
    callPending: rows.filter((row) => row.confirmationStatus !== "CONFIRMADO_CON_PACIENTE").length,
    incidents: rows.filter((row) => row.confirmationStatus === "INCIDENCIA" || row.globalStatus === "REQUIERE_ATENCION").length,
    preanesthesiaIssues: rows.filter((row) =>
      row.preanesthesiaStatus === "PENDIENTE_CON_CITA"
      || row.preanesthesiaStatus === "PENDIENTE_SIN_CITA"
      || row.preanesthesiaStatus === "NO_APTO"
    ).length,
    authorizationPending: rows.filter((row) => row.authorizationStatus === "PENDIENTE").length,
    authorizationDenied: rows.filter((row) => row.authorizationStatus === "DENEGADA").length,
    ready: rows.filter((row) => row.globalStatus === "LISTO").length,
  };
}

function weekBounds(now = new Date()): { from: string; to: string } {
  const days = getWeekDays(getWeekStart(now));
  return { from: toISODate(days[0]!), to: toISODate(days[4]!) };
}

function cards(summary: Summary): Array<{ label: string; value: number; emphasis?: "alert" | "ok" }> {
  return [
    { label: "Pacientes", value: summary.total },
    { label: "Confirmados", value: summary.confirmed, emphasis: "ok" },
    { label: "Llamadas pendientes", value: summary.callPending },
    { label: "Incidencias / atención", value: summary.incidents, emphasis: summary.incidents ? "alert" : undefined },
    { label: "Preanestesia a resolver", value: summary.preanesthesiaIssues, emphasis: summary.preanesthesiaIssues ? "alert" : undefined },
    { label: "Autorización pendiente", value: summary.authorizationPending },
    { label: "Autorización denegada", value: summary.authorizationDenied, emphasis: summary.authorizationDenied ? "alert" : undefined },
    { label: "Listos", value: summary.ready, emphasis: "ok" },
  ];
}

function SummaryBlock({ title, from, to, summary }: { title: string; from: string; to: string; summary: Summary }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--ribera-navy)]">{title}</h2>
        <span className="text-xs font-medium text-slate-500">{from} → {to}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards(summary).map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-3 ${card.emphasis === "alert" ? "border-red-200 bg-red-50" : card.emphasis === "ok" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
          >
            <p className="text-xs text-slate-600">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ManagerAppointmentsSummaryPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestorAccess(user.role)) {
      router.replace("/");
      return;
    }
    if (!modoDemo) {
      setLoading(false);
      return;
    }

    getReservations()
      .then(setReservations)
      .catch(() => setError("No se pudo cargar el resumen de Gestión de citas."))
      .finally(() => setLoading(false));
  }, [hydrated, user, router]);

  const overlays = modoDemo ? getDemoGestionCitasState() : {};
  const allRows = useMemo(() => buildGestionCitasRows(reservations, overlays), [reservations, overlays]);
  const current = useMemo(() => weekBounds(), []);
  const next = useMemo(() => nextWorkingWeekBounds(), []);
  const currentRows = useMemo(() => allRows.filter((row) => row.surgeryDate >= current.from && row.surgeryDate <= current.to), [allRows, current]);
  const nextRows = useMemo(() => allRows.filter((row) => row.surgeryDate >= next.from && row.surgeryDate <= next.to), [allRows, next]);

  if (!hydrated || loading || !user || !hasGestorAccess(user.role)) {
    return <div className="mx-auto max-w-7xl p-6 text-sm text-slate-600">Cargando resumen…</div>;
  }

  if (!modoDemo) {
    return (
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <InlineNotice variant="warning">El resumen real de Gestión de citas aún no reutiliza APIs clínicas o de gestor. Permanecerá cerrado hasta disponer del backend específico.</InlineNotice>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Gestor · DEMO</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Gestión de citas</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Visión ejecutiva de preparación de pacientes. Solo muestra recuentos operativos; no expone diagnósticos, ASA, medicación ni notas de anestesia.
        </p>
      </div>

      {error ? <InlineNotice variant="error" className="mb-4">{error}</InlineNotice> : null}

      <div className="space-y-4">
        <SummaryBlock title="Semana actual" from={current.from} to={current.to} summary={summarize(currentRows)} />
        <SummaryBlock title="Semana siguiente" from={next.from} to={next.to} summary={summarize(nextRows)} />
      </div>
    </main>
  );
}
