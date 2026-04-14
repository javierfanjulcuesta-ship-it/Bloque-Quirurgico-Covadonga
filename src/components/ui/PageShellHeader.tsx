import type { ReactNode } from "react";

export function PageShellHeader({
  title,
  subtitle,
  roleBadge,
  userLine,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  roleBadge?: string;
  userLine?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--ribera-navy)]">{title}</h1>
            {roleBadge ? (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                {roleBadge}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <div className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">{subtitle}</div>
          ) : null}
        </div>
        {userLine ? <div className="shrink-0 text-right text-sm text-slate-600">{userLine}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}

/** Encabezado de sección dentro de una pestaña (coherencia con la cabecera principal). */
export function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 border-b border-slate-200 pb-3">
      <h2 className="text-lg font-bold text-[var(--ribera-navy)]">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}
