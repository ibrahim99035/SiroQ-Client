"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchReportRaw } from "@/lib/data";
import { useCurrentUser } from "@/components/session-provider";
import { fmtDateTime } from "@/lib/utils";
import {
  REPORT_STATUS_LABELS,
  type Report,
  type ReportNode,
  type ReportResultData,
} from "@/lib/types";

/**
 * Report document schema this panel knows how to render.
 *
 * The analysis service stamps `Schema version` into the projection it emits.
 * A later revision may add keys or change their meaning, and this panel renders
 * whatever arrives without complaint — so without an explicit check, a v2
 * document on a v1 panel would quietly display its fields as if they were the
 * ones described here. Surfacing the version turns a silent misreading into a
 * visible mismatch.
 */
const KNOWN_SCHEMA_VERSION = "siroq.client.v1";

/** The document's declared schema version, if it declares one. */
function readSchemaVersion(data: ReportResultData): string | null {
  const declared = data["Schema version"];
  return typeof declared === "string" && declared.trim() !== "" ? declared.trim() : null;
}

/**
 * Report panel. Renders `report.resultData` as a recursive key/value tree —
 * nothing is hardcoded, because an attached report is an arbitrary document
 * and its shape is not known until it is uploaded.
 *
 * The previous version assumed a flat `Record<string, ReportValue>`: it read
 * `Object.entries` and handed each value to a formatter typed for primitives,
 * so a document with an object or an array inside it would have thrown at
 * runtime the moment a reviewer opened a real filing. The type now admits
 * nesting and this component walks it.
 */
export function ReportPanel({ report }: { report: Report }) {
  const [rawOpen, setRawOpen] = React.useState(false);
  const resultData = report.resultData ?? {};
  const entries = Object.entries(resultData);
  const schemaVersion = readSchemaVersion(resultData);
  const schemaMismatch = schemaVersion !== null && schemaVersion !== KNOWN_SCHEMA_VERSION;

  return (
    <section className="card overflow-hidden" aria-label="Report">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Report</p>
            {/* The report's database id is deliberately not shown. It is the
                same mistake the filing reference used to make: a uuid rendered
                as the thing a human reads, which is both unreadable and a
                leak of database identity into the interface. The id is still
                used underneath, to key the raw-document fetch. */}
            <p className="font-mono text-sm text-ink">
              {REPORT_STATUS_LABELS[report.status] === "Draft" ? "Draft report" : "Review report"}
            </p>
          </div>
          <span
            className="stamp bg-[var(--accent-strong)]"
            aria-label={`Report status: ${REPORT_STATUS_LABELS[report.status]}`}
          >
            {REPORT_STATUS_LABELS[report.status]}
          </span>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-muted">
            Generated {fmtDateTime(report.generatedAt)}
          </p>
          {/* `generatedByName` is resolved by the server. The panel used to look
              the id up in the seeded mock user list, which never holds a real
              database uuid, so every report read "by System". */}
          <p className="font-mono text-[11px] text-muted">
            by {report.generatedByName ?? "Unknown user"}
            {report.engineVersion ? ` · engine ${report.engineVersion}` : ""}
          </p>
          {/* Absent for a hand-attached report, which declares no schema — only
              a document that states a version is worth checking against it. */}
          {schemaVersion ? (
            <p
              className={`font-mono text-[11px] ${
                schemaMismatch ? "text-[var(--warning-text)]" : "text-muted"
              }`}
              title={
                schemaMismatch
                  ? `This report declares schema ${schemaVersion}. This panel renders ${KNOWN_SCHEMA_VERSION}, so some fields may be shown as something other than what they mean.`
                  : `Report schema ${schemaVersion}`
              }
            >
              schema {schemaVersion}
              {schemaMismatch ? ` · expected ${KNOWN_SCHEMA_VERSION}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">This report contains no result fields yet.</p>
      ) : (
        <dl className="divide-y divide-hairline">
          {entries.map(([label, value]) => (
            <ReportRow key={label} label={label} value={value} depth={0} />
          ))}
        </dl>
      )}

      <RawDataToggle reportId={report.id} open={rawOpen} onToggle={setRawOpen} />
    </section>
  );
}

/**
 * One key and its value. Objects and arrays recurse; everything else is
 * formatted inline. Depth is capped in the style, not the walk, so a deep
 * document is still fully visible — a report that silently hid levels past the
 * third would be worse than an indented one.
 */
function ReportRow({
  label,
  value,
  depth,
}: {
  label: string;
  value: ReportNode;
  depth: number;
}) {
  if (isBranch(value)) {
    const children = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as const)
      : Object.entries(value);

    return (
      <div className={depth > 0 ? "border-l border-hairline pl-4" : undefined}>
        <p
          className="truncate px-5 py-2 text-[13px] font-medium text-ink"
          title={label}
        >
          {label}
        </p>
        <dl className="divide-y divide-hairline/60">
          {children.length === 0 ? (
            <div className="px-5 py-1.5">
              <dd className="text-[13px] text-muted">Empty</dd>
            </div>
          ) : (
            children.map(([childLabel, childValue]) => (
              <ReportRow
                key={childLabel}
                label={childLabel}
                value={childValue}
                depth={depth + 1}
              />
            ))
          )}
        </dl>
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline justify-between gap-4 px-5 py-2.5"
      style={depth > 0 ? { paddingLeft: `${20 + depth * 16}px` } : undefined}
    >
      {/* `min-w-0` is load-bearing: a flex item's automatic minimum size is its
          content, so without it a long label at depth 5 — a service report
          keys its per-file branches by filename, and those can be Arabic —
          pushes the value off the panel rather than ellipsising. `title` keeps
          the full name reachable. The value caps at 60% so a long finding
          string wraps instead of squeezing every label to nothing. */}
      <dt className="min-w-0 flex-1 truncate text-[13px] text-muted" title={label}>
        {label}
      </dt>
      <dd className="max-w-[60%] shrink-0 text-right font-mono text-[13px] tabular-nums text-ink">
        {formatReportValue(value)}
      </dd>
    </div>
  );
}

function isBranch(value: ReportNode): value is ReportNode[] | { [key: string]: ReportNode } {
  return typeof value === "object" && value !== null;
}

/**
 * The stored document, fetched on demand. It is absent from the application row
 * on purpose — up to 4 MB per report would otherwise be inlined into every
 * list and detail response.
 */
function RawDataToggle({
  reportId,
  open,
  onToggle,
}: {
  reportId: string;
  open: boolean;
  onToggle: (next: boolean) => void;
}) {
  const user = useCurrentUser();
  const [state, setState] = React.useState<
    { status: "idle" } | { status: "loading" } | { status: "ready"; text: string } | { status: "error"; message: string }
  >({ status: "idle" });

  // Re-fetched per report id, so navigating between two filings cannot leave
  // the previous filing's document on screen under the new report's heading.
  // Reset during render rather than in an effect keyed on `reportId`: the
  // document belongs to the report, and the render that swaps reports is the
  // right moment to discard it.
  const [lastReportId, setLastReportId] = React.useState(reportId);
  if (reportId !== lastReportId) {
    setLastReportId(reportId);
    setState({ status: "idle" });
  }

  const toggle = async () => {
    if (open) {
      onToggle(false);
      return;
    }
    onToggle(true);
    if (state.status !== "idle" || !user) return;
    setState({ status: "loading" });
    try {
      const { rawData } = await fetchReportRaw(reportId, user);
      setState({ status: "ready", text: rawData });
    } catch (reason) {
      setState({
        status: "error",
        message: reason instanceof Error ? reason.message : "The document could not be loaded.",
      });
    }
  };

  return (
    <div className="border-t border-hairline px-5 py-3">
      <button
        type="button"
        onClick={() => void toggle()}
        className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
        Raw reference data
      </button>
      {open ? (
        state.status === "loading" ? (
          <p className="mt-3 text-[13px] text-muted">Loading document…</p>
        ) : state.status === "error" ? (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger-text)]">
            {state.message}
          </p>
        ) : state.status === "ready" ? (
          <pre className="raw-json mt-3" data-testid="raw-report">
            {state.text}
          </pre>
        ) : null
      ) : null}
    </div>
  );
}

/**
 * Values are formatted for display rather than assumed to be strings, because
 * the document is freeform JSON and a number or a boolean reaches here intact.
 */
function formatReportValue(value: Exclude<ReportNode, ReportNode[] | object>): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export type { ReportResultData };
