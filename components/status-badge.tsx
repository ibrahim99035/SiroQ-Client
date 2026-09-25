import * as React from "react";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Stamped status badge — solid fill, minimal radius. The muted status hues
 * are reserved for non-text markers; the stamp itself uses a darkened fill
 * so white text holds WCAG AA.
 */
export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span className={cn("stamp", `stamp-${status}`, className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: ApplicationStatus }) {
  const color: Record<ApplicationStatus, string> = {
    pending: "var(--status-pending)",
    in_review: "var(--status-in-review)",
    reported: "var(--status-reported)",
    rejected: "var(--status-rejected)",
  };
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color[status] }}
      aria-hidden="true"
    />
  );
}