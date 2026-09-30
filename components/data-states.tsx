"use client";

import { AlertTriangle, CircleSlash2, FileWarning, RotateCw } from "lucide-react";
import { useRevision } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatePanel } from "@/components/ui/state-panel";

export { useRevision };

/* ---------------------------------------------------------------------- */
/* Loading                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Ruled skeleton table — the loading state of every list view. It mirrors
 * the populated layout (header band + rows), not a shapeless spinner.
 */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-hairline/70 bg-paper-raised shadow-soft",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-center gap-4 border-b border-hairline bg-paper-raised px-4 py-3">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="ml-auto h-3.5 w-28" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-hairline px-4 py-3"
        >
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-5 w-16 rounded-pill" />
        </div>
      ))}
    </div>
  );
}

export function StatStripSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-card border border-hairline/70 bg-paper-raised px-5 py-5 shadow-soft"
        >
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Empty + error                                                          */
/* ---------------------------------------------------------------------- */

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentProps<typeof StatePanel>["icon"];
}) {
  return (
    <StatePanel icon={icon ?? FileWarning} title={title} tone="empty">
      <div className="space-y-3">
        <p>{children}</p>
        {action ? <div>{action}</div> : null}
      </div>
    </StatePanel>
  );
}

export function SystemError({
  error,
  onRetry,
  retryLabel = "Retry this query",
}: {
  error: Error;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <StatePanel icon={AlertTriangle} title="The query could not be completed." tone="error">
      <p>{error.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
      </div>
    </StatePanel>
  );
}

/* ---------------------------------------------------------------------- */
/* Not authorized                                                          */
/* ---------------------------------------------------------------------- */

export function NotAuthorized({
  title,
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <StatePanel
      icon={CircleSlash2}
      title={title ?? "This view is outside your scope."}
      tone="error"
    >
      <p>
        {detail ??
          "Your role does not include access to this area. If you need it, ask an administrator to change your access."}
      </p>
    </StatePanel>
  );
}