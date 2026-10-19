import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Lightweight, reusable UI primitives in the shadcn/ui visual style (Tailwind
 * utility compositions). Kept dependency-free so the dashboard builds without
 * the shadcn generator; see docs/architecture-decisions/0003-ui-components.md.
 */

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "bg-brand-500 hover:bg-brand-600 text-white",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700",
    danger: "bg-red-600 hover:bg-red-500 text-white",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-300",
  }[variant];
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500/50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-xl border border-slate-800 bg-slate-900/60 p-5", className)}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-slate-800 text-slate-300",
    success: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
    danger: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  }[tone];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", styles)}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
        className,
      )}
      {...props}
    />
  );
}

export function Meter({ value, label, warnBelow = 20 }: { value: number; label: string; warnBelow?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct <= warnBelow ? "bg-red-500" : pct <= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={clsx("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-400" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-brand-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <h3 className="font-semibold text-red-300">{title}</h3>
      <p className="mt-1 text-sm text-slate-300">{message}</p>
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="border-dashed text-center">
      <h3 className="font-medium text-slate-200">{title}</h3>
      {children && <div className="mt-2 text-sm text-slate-400">{children}</div>}
    </Card>
  );
}
