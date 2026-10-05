"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/client-api";
import { AnalysisRunSummary } from "@/lib/types";

/**
 * Runs the SiroQ analysis over a filing and follows it to completion.
 *
 * The analysis is a queued job on a separately deployed service, so this polls.
 * Polling is the whole interaction model, not a stopgap: the work outlives the
 * request that started it by minutes, and the service cannot call back into this
 * app, so whoever looks next collects the result.
 *
 * Five rules the implementation holds to:
 *  - the interval is cleared on unmount and as soon as the run is terminal, so a
 *    completed analysis stops costing requests;
 *  - the interval is keyed on the run id alone, so a status change does not
 *    restart it and fire a burst of duplicate polls;
 *  - a poll that fails (service down, network blip) is reported but never marks
 *    the run failed, because the job may well still be running;
 *  - a run already in flight when the page loads is picked up rather than
 *    reported as "never analysed", which is what the automatic trigger makes
 *    necessary — the run belongs to the filing, not to whoever happens to be
 *    looking at it;
 *  - starting a run is refused by the server while one is live, so the button
 *    that means "go again" is only ever offered for a run that has finished.
 */

const POLL_INTERVAL_MS = 4000;
/** Give up after a while and say so, rather than polling a dead service forever. */
const POLL_DEADLINE_MS = 15 * 60 * 1000;

type RunStatus = "idle" | "queued" | "running" | "succeeded" | "failed";

const LIVE: ReadonlySet<RunStatus> = new Set<RunStatus>(["queued", "running"]);

interface PostResponse {
  ok?: boolean;
  runId?: string;
  status?: string;
  alreadyRunning?: boolean;
}

interface GetResponse {
  ok?: boolean;
  runId?: string;
  status?: RunStatus | null;
  errorMessage?: string | null;
  reportStored?: boolean;
  reason?: string;
}

export interface AnalysisPanelProps {
  applicationId: string;
  /** Rendered only when the server says the integration is usable. */
  available: boolean;
  /**
   * Most recent run, from the filing's own row.
   *
   * Lets the panel resume an in-flight analysis — including one an automatic
   * trigger started before this page existed — and tell "analysed" apart from
   * "not yet analysed".
   */
  latestRun?: AnalysisRunSummary | null;
  /** Called once a report has actually been stored, so the page can re-read it. */
  onReportStored: () => void;
}

export function AnalysisPanel({
  applicationId,
  available,
  latestRun,
  onReportStored,
}: AnalysisPanelProps) {
  // Seeded from the run the server already has, so the first paint is the truth
  // rather than an "idle" panel that then corrects itself a tick later.
  const initialRunId = latestRun?.runId ?? null;
  const initialStatus: RunStatus = initialRunId ? latestRun!.status : "idle";

  const [status, setStatus] = React.useState<RunStatus>(initialStatus);
  const [runId, setRunId] = React.useState<string | null>(initialRunId);
  const [message, setMessage] = React.useState<string | null>(
    // A run that already failed is worth saying out loud on arrival; one that is
    // merely in flight speaks for itself below.
    initialStatus === "failed"
      ? latestRun!.errorMessage || "The last analysis of this filing failed."
      : null,
  );
  const [notice, setNotice] = React.useState<string | null>(null);

  // Refs, not state: read inside the poll callback, which must not be torn down
  // and rebuilt every time the status it reports changes.
  const terminalRef = React.useRef(!LIVE.has(initialStatus));
  // A resumed run may have been going for longer than this page has been open,
  // so the deadline is measured from when the run started, not from mount. Back
  // off to "no time spent here yet" if the timestamp is missing or unparseable.
  const startedAtRef = React.useRef(
    initialRunId ? Date.parse(latestRun!.startedAt) || 0 : 0,
  );

  const stop = React.useCallback((next: RunStatus) => {
    terminalRef.current = true;
    setStatus(next);
  }, []);

  const pollOnce = React.useCallback(
    async (id: string) => {
      if (terminalRef.current) return;

      // `0` means the start time was unknown, not that the run is ancient —
      // without this the first poll would trip the deadline immediately.
      const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      if (elapsed > POLL_DEADLINE_MS) {
        stop("idle");
        setMessage(
          "This analysis is taking longer than expected. It may still finish in the background — reopen this filing to check again.",
        );
        return;
      }

      let body: GetResponse;
      try {
        body = await apiFetch<GetResponse>(
          `/api/applications/${applicationId}/analysis?runId=${encodeURIComponent(id)}`,
        );
      } catch (error) {
        // Not the run's fault, and not proof it failed: say what happened and
        // stop, so a service outage does not masquerade as a bad filing.
        stop("idle");
        setMessage(
          error instanceof ApiError
            ? error.message
            : "Could not reach the analysis service.",
        );
        return;
      }

      if (terminalRef.current) return; // unmounted or stopped mid-request

      const next = body.status ?? "queued";
      setStatus(next);

      if (next === "succeeded") {
        terminalRef.current = true;
        if (body.reportStored) {
          onReportStored();
        } else if (body.reason) {
          setNotice(body.reason);
        } else {
          setNotice("The analysis finished but produced no report for this filing.");
        }
        setMessage(null);
        return;
      }

      if (next === "failed") {
        stop("failed");
        setMessage(body.errorMessage || "The analysis failed. See the service logs for detail.");
      }
    },
    [applicationId, onReportStored, stop],
  );

  // Keyed on runId alone: re-running this effect on every status change would
  // fire an extra poll each time the status it just reported comes back around.
  React.useEffect(() => {
    if (!runId || terminalRef.current) return;
    const timer = window.setInterval(() => {
      void pollOnce(runId);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [runId, pollOnce]);

  /**
   * Asks the server to start a run.
   *
   * `force` is for re-running a filing whose previous run has already finished.
   * The server refuses to stack live runs on its own, so `force` is only ever
   * sent from a terminal state — two concurrent runs of the same bytes would race
   * to write the same report, and the loser would overwrite the winner's result
   * with an identical one at best.
   */
  const start = async (options?: { force?: boolean }) => {
    setMessage(null);
    setNotice(null);
    terminalRef.current = false;
    setStatus("queued");
    try {
      const body = await apiFetch<PostResponse>(`/api/applications/${applicationId}/analysis`, {
        method: "POST",
        body: options?.force ? { force: true } : {},
      });
      if (!body.runId) {
        stop("idle");
        setMessage("The analysis could not be started.");
        return;
      }
      setRunId(body.runId);
      startedAtRef.current = Date.now();
      if (body.alreadyRunning) {
        setNotice("An analysis for this filing was already running; following that one.");
      }
    } catch (error) {
      stop("idle");
      setMessage(
        error instanceof ApiError
          ? error.message
          : "The analysis could not be started. Try again in a moment.",
      );
    }
  };

  if (!available) return null;

  const busy = LIVE.has(status);
  // Only offered once something has finished. While a run is live the single
  // disabled button is the whole affordance: offering "Re-run" there would invite
  // a second run of the same files.
  const finished = status === "succeeded" || status === "failed";

  return (
    <section className="card px-5 py-4" aria-labelledby="analysis-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="analysis-title" className="text-base font-semibold text-ink">
            Automated analysis
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {busy
              ? "Analysing… this can take a few minutes for a large filing."
              : status === "succeeded"
                ? "Analysis complete."
                : "Send this filing's files to the analysis service. It returns a draft report below."}
          </p>
        </div>
        {finished ? (
          <Button size="sm" variant="secondary" onClick={() => void start({ force: true })}>
            Re-run analysis
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void start()}>
            {busy ? "Analysing…" : "Run analysis"}
          </Button>
        )}
      </div>

      {busy ? (
        <p className="mt-3 text-[13px] text-muted" aria-live="polite">
          Job <span className="font-mono text-[11px] text-ink">{runId?.slice(0, 8)}</span> is{" "}
          {status}. You can leave this page and come back.
        </p>
      ) : null}

      {notice ? (
        <p
          className="mt-3 border border-hairline px-3 py-2 text-[13px] text-muted"
          aria-live="polite"
        >
          {notice}
        </p>
      ) : null}

      {message ? (
        <p
          role="alert"
          className="mt-3 border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[var(--danger-text)]"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
