import type { ReactNode } from "react";

const styles: Record<string, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-rose-200 bg-rose-50 text-rose-950",
};

export function InlineNotice({
  variant,
  children,
  className = "",
  role,
  "aria-live": ariaLive,
}: {
  variant: keyof typeof styles;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
  "aria-live"?: "polite" | "assertive" | "off";
}) {
  const r = role ?? (variant === "error" ? "alert" : "status");
  return (
    <div
      role={r}
      aria-live={ariaLive}
      className={`rounded-lg border px-3 py-2.5 text-sm leading-snug ${styles[variant]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
