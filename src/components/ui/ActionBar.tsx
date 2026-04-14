import type { ReactNode } from "react";

export function ActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
