"use client";

import { ArrowRight, FilePlus2, PencilLine, Trash2 } from "lucide-react";

import { fmtDateTime, formatBytes } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/types";
import type { FileEvent, Role } from "@/lib/types";

const KIND_META: Record<
  FileEvent["kind"],
  { label: string; icon: typeof PencilLine; className: string }
> = {
  uploaded: {
    label: "Uploaded",
    icon: FilePlus2,
    className: "text-[var(--success-text)]",
  },
  replaced: {
    label: "Replaced",
    icon: PencilLine,
    className: "text-[var(--warning-text)]",
  },
  deleted: {
    label: "Removed",
    icon: Trash2,
    className: "text-[var(--status-rejected-fill)]",
  },
};

/**
 * Evidence custody log — every change to a filing's files, newest first.
 *
 * A separate block from `StatusTimeline` rather than another stage on it, because
 * the two answer different questions. The timeline answers "where is this filing
 * in review", which has three states and always ends. This answers "has the
 * evidence under it moved since anyone last looked", which has no terminal state
 * and is the question an auditor actually asks after a filing is reported.
 * Folding the entries into the stage list would also misfile them: a file
 * replaced during `in_review` has no status change to hang from.
 *
 * Read-only by construction. There is no route that edits or removes a
 * `FileEvent` — the entries are written in the same transaction as the change
 * they describe and outlive it, which is why a `deleted` entry can still name a
 * file id that resolves to nothing.
 *
 * The previous checksum is rendered in full rather than truncated with a tooltip:
 * it is the only proof of what the bytes were, and a hidden hash is not evidence.
 */
export function FileCustodyLog({
  events,
}: {
  events: FileEvent[] | undefined;
}) {
  if (!events || events.length === 0) {
    return (
      <div className="card px-5 py-4">
        <p className="text-[13px] text-muted">
          No file has been added, replaced or removed on this filing.
        </p>
      </div>
    );
  }

  return (
    <ol className="card divide-y divide-hairline/60 px-5 py-2">
      {events.map((event) => {
        const meta = KIND_META[event.kind];
        const Icon = meta.icon;
        const roleLabel = event.actorRole
          ? (ROLE_LABELS[event.actorRole as Role] ?? event.actorRole)
          : null;
        return (
          <li key={event.id} className="flex gap-3 py-3">
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink">
                <span className="font-semibold">{meta.label}</span>
                <span className="font-mono text-[12px] break-all">
                  {event.filename}
                </span>
              </p>
              <p className="text-[12px] text-muted">
                {event.actorName ?? "Unknown actor"}
                {roleLabel ? ` · ${roleLabel}` : null} ·{" "}
                {fmtDateTime(event.createdAt)}
              </p>

              {event.previousFilename ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="font-mono break-all">
                    was {event.previousFilename}
                  </span>
                  {event.previousSizeBytes !== null &&
                  event.previousSizeBytes !== undefined ? (
                    <span>({formatBytes(event.previousSizeBytes)})</span>
                  ) : null}
                  {event.previousChecksumSha256 ? (
                    <span className="font-mono break-all">
                      sha256 {event.previousChecksumSha256}
                    </span>
                  ) : null}
                </p>
              ) : null}

              {event.note ? (
                <p className="mt-1 text-[12px] text-muted-foreground italic">
                  {event.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
