import type { ReactNode } from "react";

export function AppNavTab({
  active,
  onClick,
  children,
  emphasized,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** CTA secundaria (p. ej. ir a reservar desde calendario): más visible que una pestaña normal inactiva. */
  emphasized?: boolean;
}) {
  const base =
    "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2";
  const state = active
    ? "bg-red-600 text-white shadow-sm hover:bg-red-700"
    : emphasized
      ? "border-2 border-red-200 bg-white text-red-800 hover:bg-red-50"
      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  return (
    <button type="button" onClick={onClick} className={`${base} ${state}`}>
      {children}
    </button>
  );
}
