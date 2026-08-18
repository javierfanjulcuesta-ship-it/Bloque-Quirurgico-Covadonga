"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { modoDemo } from "@/lib/config";
import { getNotificationsForUser } from "@/lib/storageMensajesYNotificaciones";

/**
 * Persistent entry point to the responsible surgeon's private inbox.
 * In isolated DEMO the count is read only from localStorage and never calls /api.
 */
export default function CirujanoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated } = useAuth();
  const [unread, setUnread] = useState(0);

  const ownsSurgeonInbox = user?.role === "cirujano" || user?.role === "endoscopista";

  useEffect(() => {
    if (!hydrated || !user || !ownsSurgeonInbox || !modoDemo) {
      setUnread(0);
      return;
    }

    const refresh = () => {
      const count = getNotificationsForUser(user.id).filter((notification) => !notification.read).length;
      setUnread(count);
    };
    refresh();

    // storage events do not fire in the same tab. A bounded lightweight poll keeps
    // the badge accurate after a different QxFlow DEMO workflow creates a notice.
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [hydrated, user, ownsSurgeonInbox]);

  return (
    <>
      {children}
      {hydrated && user && ownsSurgeonInbox && pathname !== "/cirujano/notificaciones" ? (
        <button
          type="button"
          onClick={() => router.push("/cirujano/notificaciones")}
          className="fixed bottom-5 right-5 z-40 flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[var(--ribera-navy)] shadow-lg hover:bg-slate-50"
          aria-label={`Abrir buzón privado${unread > 0 ? `, ${unread} sin leer` : ""}`}
        >
          <span aria-hidden="true">🔔</span>
          <span>Buzón</span>
          {unread > 0 ? (
            <span className="min-w-6 rounded-full bg-[var(--ribera-red)] px-1.5 py-0.5 text-center text-xs font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
