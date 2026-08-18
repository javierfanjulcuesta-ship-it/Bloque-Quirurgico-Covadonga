"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { hasGestorAccess } from "@/lib/types";

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const manager = hydrated && !!user && hasGestorAccess(user.role);

  return (
    <>
      {manager ? (
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur md:px-6">
          <nav className="mx-auto flex w-full max-w-7xl gap-2" aria-label="Áreas de gestión">
            <button
              type="button"
              onClick={() => router.push("/calendario")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${pathname === "/calendario" ? "bg-[var(--ribera-navy)] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Bloque quirúrgico
            </button>
            <button
              type="button"
              onClick={() => router.push("/calendario/gestion-citas")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${pathname === "/calendario/gestion-citas" ? "bg-[var(--ribera-navy)] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Gestión de citas
            </button>
          </nav>
        </div>
      ) : null}
      {children}
    </>
  );
}
