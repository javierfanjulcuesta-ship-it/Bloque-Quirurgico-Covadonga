"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import type { AppNotification } from "@/lib/types";
import {
  getNotificationsForUser,
  markAllNotificationsReadForUser,
  markNotificationRead,
} from "@/lib/storageMensajesYNotificaciones";
import { InlineNotice } from "@/components/ui/InlineNotice";

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function categoryFor(notification: AppNotification): string {
  const title = notification.title.toLowerCase();
  if (title.includes("autoriz")) return "Autorización";
  if (title.includes("anul")) return "Anulación";
  if (title.includes("preanest")) return "Preanestesia";
  if (title.includes("cambio") || title.includes("program")) return "Programación";
  return "Aviso operativo";
}

export default function SurgeonNotificationsPage() {
  const router = useRouter();
  const { user, hydrated, logout } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const allowed = user?.role === "cirujano" || user?.role === "endoscopista";

  const refresh = useCallback(() => {
    if (!user || !allowed || !modoDemo) return;
    setNotifications(
      getNotificationsForUser(user.id)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
  }, [user, allowed]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!allowed) {
      router.replace("/");
      return;
    }
    refresh();
  }, [hydrated, user, allowed, router, refresh]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  if (!hydrated || !user || !allowed) return null;

  if (!modoDemo) {
    return (
      <main className="mx-auto max-w-4xl p-4 md:p-6">
        <button type="button" onClick={() => router.push("/cirujano")} className="mb-4 text-sm font-medium text-[var(--ribera-navy)] hover:underline">
          ← Volver a programación
        </button>
        <InlineNotice variant="warning">
          El buzón privado está preparado en la interfaz, pero su persistencia real todavía no está conectada. No se reutiliza localStorage ni una API genérica fuera de DEMO.
        </InlineNotice>
      </main>
    );
  }

  const markOne = (id: string) => {
    markNotificationRead(id);
    refresh();
  };

  const markAll = () => {
    markAllNotificationsReadForUser(user.id);
    refresh();
  };

  return (
    <main className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => router.push("/cirujano")} className="mb-2 text-sm font-medium text-[var(--ribera-navy)] hover:underline">
            ← Volver a programación
          </button>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ribera-red)]">Buzón privado · DEMO</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--ribera-navy)]">Notificaciones</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Aquí solo aparecen avisos dirigidos a su usuario como profesional responsable. Los avisos de otros cirujanos no se muestran.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 ? (
            <button type="button" onClick={markAll} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Marcar todo como leído
            </button>
          ) : null}
          <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">Total: <strong>{notifications.length}</strong></span>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800">Sin leer: <strong>{unreadCount}</strong></span>
      </div>

      {notifications.length === 0 ? (
        <InlineNotice variant="info">No tiene avisos privados pendientes en esta DEMO.</InlineNotice>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-xl border p-4 shadow-sm ${notification.read ? "border-slate-200 bg-white" : "border-red-200 bg-red-50/40"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!notification.read ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--ribera-red)]" aria-label="Sin leer" /> : null}
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {categoryFor(notification)}
                    </span>
                    <h2 className="font-semibold text-slate-900">{notification.title}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{notification.message}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatNotificationDate(notification.date)}</p>
                </div>
                {!notification.read ? (
                  <button type="button" onClick={() => markOne(notification.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Marcar leído
                  </button>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Leído</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
