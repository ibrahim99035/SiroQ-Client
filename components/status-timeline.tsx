"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";
import type { Application, StatusEvent } from "@/lib/types";

/**
 * Status timeline — an audit trail of every status change: who moved the
 * filing, when, and with what note. The current node is the single warm
 * moment on the filing screen.
 */
export function StatusTimeline({ application }: { application: Application }) {
  const upload = application.history.find((e) => e.to === "pending");

  if (application.status === "rejected") {
    return (
<ol className="card px-5 py-6">
        {upload ? <StepRow stage="done" label="Uploaded" event={upload} /> : null}
        <RejectedRow application={application} />
      </ol>
    );
  }

  const stageOrder = ["pending", "in_review", "reported"] as const;
  const currentIndex = stageOrder.indexOf(application.status);
  const stages: { key: string; label: string }[] = [
    { key: "pending", label: "Uploaded" },
    { key: "in_review", label: "In review" },
    { key: "reported", label: "Reported" },
  ];

  return (
    <ol className="card px-5 py-6">
      {stages.map((stage, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const event = application.history.find((e) => e.to === stage.key);
        return (
          <StepRow
            key={stage.key}
            stage={reached ? (isCurrent ? "current" : "done") : "upcoming"}
            label={stage.label}
            event={event}
            note={
              isCurrent
                ? currentIndex === 0
                  ? "Awaiting triage"
                  : "Filing is at this stage"
                : undefined
            }
          />
        );
      })}
    </ol>
  );
}

type StageState = "done" | "current" | "upcoming";

function StepRow({
  stage,
  label,
  event,
  note,
}: {
  stage: StageState;
  label: string;
  event?: StatusEvent;
  note?: string;
}) {
  return (
    <li className="relative pb-8 pl-10 last:pb-0">
      {stage !== "upcoming" ? (
        <span className="absolute left-0 top-0 h-full w-px bg-hairline" aria-hidden="true" />
      ) : null}
      <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2" aria-hidden="true">
        {stage === "done" ? (
          <span className="grid h-4 w-4 place-items-center rounded-full bg-accent">
            <Check className="h-3 w-3 text-white" />
          </span>
        ) : stage === "current" ? (
          <span className="block h-4 w-4 animate-timeline-pulse rounded-full border-[3px] border-[var(--accent-warm)]" />
        ) : (
          <span className="block h-4 w-4 rounded-full border border-hairline bg-paper-raised" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium text-ink">
          {label}
          {note ? (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--accent-warm-strong)]">
              {note}
            </span>
          ) : null}
        </p>
        {event ? (
          <p className="mt-0.5 font-mono text-[11px] text-muted">
            {actorName(event.changedByName)} · {fmtDateTime(event.changedAt)}
          </p>
        ) : (
          <p className="mt-0.5 font-mono text-[11px] text-muted">Not yet reached</p>
        )}
        {event?.note ? <p className="mt-1 max-w-xl text-[13px] leading-snug text-ink/80">{event.note}</p> : null}
      </div>
    </li>
  );
}

function RejectedRow({ application }: { application: Application }) {
  const reject = application.history.find((e) => e.to === "rejected");
  return (
    <li className="relative pt-6 pl-10">
      <span className="absolute left-0 top-0 h-full w-px bg-[var(--status-rejected)]/40" aria-hidden="true" />
      <span className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2" aria-hidden="true">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--status-rejected-fill)]">
          <X className="h-3 w-3 text-white" />
        </span>
      </span>
      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-ink">Rejected</p>
        {reject ? (
          <>
            <p className="mt-0.5 font-mono text-[11px] text-muted">
              {actorName(reject.changedByName)} · {fmtDateTime(reject.changedAt)}
            </p>
            {reject.note ? <p className="mt-1 max-w-xl text-[13px] leading-snug text-ink/80">{reject.note}</p> : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The name the server resolved from the event's `changedBy` relation.
 *
 * There is no client-side fallback lookup left to do. The audit trail used to
 * consult the mock user list, where a real database uuid matched nothing and so
 * every action in the chain of custody rendered as "System" — a fabricated
 * actor on the one screen whose entire purpose is to say who did what.
 *
 * `changedBy` is a required relation, so the server always resolves a name; the
 * fallback exists only so a malformed row degrades to something honest instead
 * of silently naming someone who was never there.
 */
function actorName(name: string | undefined): string {
  return name ?? "Unknown user";
}