/**
 * Leyenda alineada con clases reales del calendario (globals: .slot-free, .slot-reserved, etc.).
 */

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-4 w-4 shrink-0 rounded border ${className}`} aria-hidden />
      <span>{label}</span>
    </li>
  );
}

export function CalendarStateLegend({
  className = "",
  variant = "default",
  showAnestesistaHint,
}: {
  className?: string;
  variant?: "default" | "compact";
  /** Solo en vistas donde aplica la asignación de anestesia en celda. */
  showAnestesistaHint?: boolean;
}) {
  const text = variant === "compact" ? "text-[11px] leading-tight" : "text-xs";
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/95 px-3 py-2 ${className}`.trim()}
      aria-label="Leyenda de estados del calendario"
    >
      <p className={`mb-1.5 font-semibold uppercase tracking-wide text-slate-500 ${variant === "compact" ? "text-[10px]" : "text-xs"}`}>
        Estados del hueco
      </p>
      <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-slate-700 ${text}`}>
        <Swatch className="slot-free" label="Libre" />
        <Swatch className="slot-reserved" label="Reservado (sin programar o en curso)" />
        <Swatch className="slot-occupied" label="Programado / ocupado" />
        <Swatch className="slot-private" label="Incluye financiación privada" />
        <Swatch className="slot-sespa" label="Incluye SESPA" />
        <Swatch className="border-slate-400 bg-slate-200" label="Cerrado / urgencias" />
        {showAnestesistaHint ? (
          <li className="flex items-center gap-2">
            <span
              className="h-4 w-4 shrink-0 rounded border border-amber-300 bg-amber-50 ring-2 ring-amber-500 ring-offset-1"
              aria-hidden
            />
            <span>Asignación de anestesia (usted)</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
