import type { ReactNode } from "react";

interface WorkspaceAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export function WorkspaceQuickActions({
  title,
  subtitle,
  nextAction,
  actions,
  rightContent,
}: {
  title: string;
  subtitle: string;
  nextAction: string;
  actions: WorkspaceAction[];
  rightContent?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">{title}</h2>
          <p className="mt-1 text-sm text-slate-700">{subtitle}</p>
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Siguiente acción:</span> {nextAction}
          </p>
        </div>
        {rightContent ? <div className="shrink-0">{rightContent}</div> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={
              a.primary
                ? "btn-ribera-primary px-4 py-2 text-sm"
                : "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

