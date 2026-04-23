import type { ReactNode } from "react";

const toneClasses = {
  neutral: "border-slate-300 bg-slate-50 text-slate-700",
  info: "border-sky-300 bg-sky-50 text-sky-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  danger: "border-rose-300 bg-rose-50 text-rose-800",
  private: "border-orange-300 bg-orange-50 text-orange-800",
  mutual: "border-violet-300 bg-violet-50 text-violet-800",
  sespa: "border-rose-300 bg-rose-100 text-rose-800",
} as const;

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-[9px]",
  md: "px-2 py-0.5 text-[10px]",
} as const;

export function StatusBadge({
  tone = "neutral",
  size = "md",
  children,
  className = "",
}: {
  tone?: keyof typeof toneClasses;
  size?: keyof typeof sizeClasses;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border font-semibold uppercase tracking-wide ${toneClasses[tone]} ${sizeClasses[size]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

export function FundingBadge({
  type,
  size = "sm",
}: {
  type: "sespa" | "private" | "mutual";
  size?: keyof typeof sizeClasses;
}) {
  const tone = type === "sespa" ? "sespa" : type === "private" ? "private" : "mutual";
  const label = type === "sespa" ? "SESPA" : type === "private" ? "Privado" : "Mutua";
  return <StatusBadge tone={tone} size={size}>{label}</StatusBadge>;
}

