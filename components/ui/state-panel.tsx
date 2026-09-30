import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  error: { border: "border-[var(--status-rejected)]/50", iconText: "text-[var(--status-rejected-fill)]" },
  warning: { border: "border-[var(--warning-border)]/50", iconText: "text-[var(--warning-text)]" },
  empty: { border: "border-hairline", iconText: "text-muted" },
} as const;

export interface StatePanelProps {
  tone?: keyof typeof TONES;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A rule-framed state panel used for loading/empty/error/blocked states.
 * Written in the interface's own voice: it says what happened and what to do.
 */
export function StatePanel({ tone = "empty", icon: Icon, title, children, className }: StatePanelProps) {
  const t = TONES[tone];
  return (
    <div
      role="status"
      className={cn(
        "rounded-card border bg-paper-raised px-6 py-8 text-left shadow-soft",
        t.border,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.iconText)} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{title}</p>
          <div className="mt-1 text-sm text-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}