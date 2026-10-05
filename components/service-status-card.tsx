"use client";

import { Activity, Loader2, Moon, RefreshCw } from "lucide-react";
import * as React from "react";

import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Sidebar card that reports whether the analysis service is awake, and wakes it.
 *
 * ## Why this card exists
 *
 * The analysis service runs on Render's free tier, which suspends the process
 * after a spell of no traffic and cold-starts it on the next request. That is
 * deliberate — it is what keeps the deployment off a paid always-on instance — but
 * it puts a cold start in front of work that is already slow, and from the
 * outside "nothing is happening" and "the service is asleep" look identical.
 *
 * So waking is an explicit act with an explicit outcome:
 *
 * - **Awake** — `/health` answered. Costs nothing extra.
 * - **Asleep** — the probe did not answer. Press to start it.
 * - **Off** — no analysis configuration. The card disappears, because a control
 *   that can only ever fail is worse than no control.
 *
 * ## What this card deliberately does not do
 *
 * It does not start or track a run. That already lives where it belongs, in
 * `analysis-panel` against `/api/applications/[id]/analysis`; a second copy of it
 * in the sidebar would be two places to keep in step and a second thing polling.
 * This card answers one question — is it awake — and gets out of the way.
 *
 * ## Why nothing polls
 *
 * No interval, no `setTimeout`, no keep-alive ping. A card that re-probed every
 * few seconds would hold Render awake almost permanently, spending the very
 * monthly allowance this design exists to protect. The state changes when someone
 * asks about it.
 */

interface HealthResponse {
  enabled: boolean;
  reachable: boolean | null;
  service: { status: string; db?: string } | null;
}

/** `null` means "not asked yet", which renders as busy. */
type State = "off" | "asleep" | "awake" | null;

export function ServiceStatusCard({ className }: { className?: string }) {
  const [state, setState] = React.useState<State>(null);
  const [pending, setPending] = React.useState(false);
  const [dbDown, setDbDown] = React.useState(false);

  // One probe on mount, and again on demand. The `.then` shape matches
  // `session-provider`: state is set from the promise callbacks, so the effect
  // never sets state before it has learned anything.
  React.useEffect(() => {
    let cancelled = false;
    apiFetch<HealthResponse>("/api/analysis/health").then(
      (body) => {
        if (cancelled) return;
        setState(body.enabled ? (body.reachable ? "awake" : "asleep") : "off");
        setDbDown(body.service?.db === "down");
      },
      () => {
        if (cancelled) return;
        setState("asleep");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = React.useCallback(() => {
    setPending(true);
    apiFetch<HealthResponse>("/api/analysis/health").then(
      (body) => {
        setState(body.enabled ? (body.reachable ? "awake" : "asleep") : "off");
        setDbDown(body.service?.db === "down");
        setPending(false);
      },
      () => {
        setState("asleep");
        setPending(false);
      },
    );
  }, []);

  // Nothing configured on this deployment — render nothing at all.
  if (state === "off") return null;

  const awake = state === "awake";
  const busy = pending || state === null;

  return (
    <section
      aria-label="Analysis service"
      className={cn(
        "mt-4 rounded-stamp border border-hairline bg-paper-raised/70 p-3 shadow-soft",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted">Analysis</h2>
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-hairline"
          style={
            awake
              ? { background: "var(--status-reported-fill)", color: "var(--status-reported)" }
              : { background: "var(--paper)", color: "var(--muted-text)" }
          }
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          ) : awake ? (
            <Activity aria-hidden="true" className="size-3" />
          ) : (
            <Moon aria-hidden="true" className="size-3" />
          )}
          {awake ? "Awake" : busy ? "Checking" : "Asleep"}
        </span>
      </header>

      {dbDown ? (
        <p className="mt-1.5 text-[10px] leading-snug text-muted">
          The service is up but cannot reach its database.
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2.5 w-full justify-center"
        disabled={busy}
        onClick={onRefresh}
      >
        <RefreshCw aria-hidden="true" className={cn("size-3.5", busy && "animate-spin")} />
        {state === "asleep" ? "Wake service" : "Refresh"}
      </Button>
    </section>
  );
}