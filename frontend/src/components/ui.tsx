import type { ReactNode } from "react";
import { ApiError } from "../api/client";

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header>
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {hint && <small> {hint}</small>}
      </dd>
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <dl className="stats">{children}</dl>;
}

export function Notice({
  kind,
  children,
  role,
}: {
  kind: "error" | "success" | "info" | "warn";
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className={`notice ${kind}`} role={role ?? (kind === "error" ? "alert" : undefined)}>
      {children}
    </div>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> <p>{what}…</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
  const net = error instanceof ApiError && error.code === "network_error";
  return (
    <div className="state-box" role="alert">
      <h2>{net ? "Server unreachable" : "Something went wrong"}</h2>
      <p>{msg}</p>
      {onRetry && (
        <button type="button" className="btn secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state-box">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${pct}%`}
      className="progress"
    >
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
