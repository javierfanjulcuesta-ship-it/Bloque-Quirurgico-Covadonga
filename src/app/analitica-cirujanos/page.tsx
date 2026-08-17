"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUsers } from "@/context/UsersContext";
import { hasGestorAccess, type Reservation } from "@/lib/types";
import { getReservations } from "@/lib/reservations";
import { buildSurgeonManagementProfiles } from "@/lib/metrics/surgeonProfileAnalytics";
import { SurgeonAnalyticsPanel } from "@/components/gestor/SurgeonAnalyticsPanel";

export default function SurgeonAnalyticsPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { users } = useUsers();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!hasGestorAccess(user.role)) {
      router.replace("/calendario");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || !hasGestorAccess(user.role)) return;
    let active = true;
    setLoading(true);
    getReservations()
      .then((data) => {
        if (!active) return;
        setReservations(data);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setReservations([]);
        setError("No se pudo cargar la actividad para el análisis.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrated, user]);

  const profiles = useMemo(
    () => buildSurgeonManagementProfiles({ reservations, usersDirectory: users }),
    [reservations, users]
  );

  if (!hydrated || !user || !hasGestorAccess(user.role)) {
    return <main className="min-h-screen bg-slate-50" />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gestión · QxFlow</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Ficha de actividad por cirujano</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Lectura operativa sencilla de reservas, programación, antelación, liberaciones y financiadores. La capa real se completará con actividad agregada y desidentificada del Libro de quirófano.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/calendario")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver al calendario
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Programado = datos de QxFlow. Real = cierre de actividad importado. Si no hay cierre real, se muestra “Pendiente” y nunca se sustituye por una estimación.
        </div>

        {error ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Calculando perfiles…</div>
        ) : (
          <SurgeonAnalyticsPanel profiles={profiles} />
        )}
      </div>
    </main>
  );
}
