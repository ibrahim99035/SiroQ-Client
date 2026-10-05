"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";
import { fetchReportRaw } from "@/lib/data";
import { useCurrentUser } from "@/components/session-provider";
import { fmtDateTime, parseServiceNumber } from "@/lib/utils";
import {
  isChartNode,
  isForecastNode,
  isNotesNode,
  isRichTextNode,
  REPORT_STATUS_LABELS,
  type Report,
  type ReportNode,
  type ReportResultData,
} from "@/lib/types";
import {
  ReportBarChart,
  ReportForecastChart,
  ReportNotes,
  ReportTableChart,
  SEVERITY_STYLES,
} from "@/components/report-chart";
import { ReportRichText } from "@/components/rich-text-renderer";

/**
 * Report document schema this panel knows how to render.
 *
 * The analysis service stamps `Schema version` into the projection it emits.
 * A later revision may add keys or change their meaning, and this panel renders
 * whatever arrives without complaint — so without an explicit check, a v2
 * document on a v1 panel would quietly display its fields as if they were the
 * ones described here. Surfacing the version turns a silent misreading into a
 * visible mismatch.
 *
 * `siroq.client.v1` also covers the tagged nodes (`$chart`, `$forecast`,
 * `$notes`), which are additive: an untagged document renders as the plain tree
 * it always was, and an unrecognised `$`-tag falls through to the branch
 * renderer. That is why adding them did not warrant a bump — see
 * `docs/CLIENT_REPORT_CONTRACT.md` in the analysis service.
 */
const KNOWN_SCHEMA_VERSION = "siroq.client.v1";

/**
 * How the document's top level is arranged.
 *
 * The projection is a flat label→value tree, and rendering it as one long
 * `<dl>` is what made this panel unreadable: seventeen peer rows, of which four
 * are the headline numbers and two are database uuids. The service's own
 * printable report (`app/templates/report.html`) already groups the same keys
 * into a summary band and per-file sections, so these lists mirror that grouping
 * rather than inventing one.
 *
 * Inference, not a schema change. A key that appears in none of these lists
 * still renders, through the recursive tree, so a hand-attached report with an
 * arbitrary shape is unaffected — as is any future projection key, which lands
 * in `EXTRA_KEYS` and renders as it always did.
 */
const KPI_KEYS = [
  "Files analyzed",
  "Records examined",
  "Data quality score",
  "Findings requiring review",
] as const;

const METADATA_KEYS = [
  "Application",
  "Analyzed at",
  "Engine version",
  "Categories detected",
  "Quality verdict",
  "Duplicate rows",
  "Files failing a quality check",
] as const;

/**
 * Never rendered as a visible row.
 *
 * The panel header argues at length for not putting a uuid in front of a
 * reviewer, then the body printed two of them. They are still in the document
 * and still reachable under "Raw reference data"; they are only kept out of the
 * reading surface.
 */
const SUPPRESSED_KEYS = new Set(["Application ID", "Analysis ID"]);

const FILES_KEY = "Files";
const EVIDENCE_KEY = "Evidence gaps";

/** The document's declared schema version, if it declares one. */
function readSchemaVersion(data: ReportResultData): string | null {
  const declared = data["Schema version"];
  return typeof declared === "string" && declared.trim() !== "" ? declared.trim() : null;
}

/** A scalar as display text, whatever primitive it arrived as. */
function scalarText(value: ReportNode | undefined): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return Array.isArray(value) ? value.join(", ") : "—";
  return String(value);
}

/**
 * Quality score → colour band, at the same thresholds the printable uses
 * (`report.html:176-178`: 90 good, 70 warn). A score that cannot be read is not
 * coloured, rather than being guessed into a band it might not belong to.
 */
function qualityTone(score: string | undefined): "good" | "warn" | "bad" | null {
  const value = parseServiceNumber(score);
  if (value === null) return null;
  if (value >= 90) return "good";
  if (value >= 70) return "warn";
  return "bad";
}

const TONE_CLASS: Record<string, string> = {
  good: "text-status-reported",
  warn: "text-[var(--warning-text)]",
  bad: "text-status-rejected",
};

/**
 * Report panel. Renders `report.resultData` — nothing about the document's
 * contents is hardcoded, because an attached report is an arbitrary document
 * and its shape is not known until it is uploaded. A service projection is
 * *arranged* into sections; anything unrecognised still renders as the
 * recursive key/value tree.
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
  const schemaVersion = readSchemaVersion(resultData);
  const schemaMismatch = schemaVersion !== null && schemaVersion !== KNOWN_SCHEMA_VERSION;

  const kpis = KPI_KEYS.filter((key) => resultData[key] !== undefined);
  const metadata = METADATA_KEYS.filter((key) => resultData[key] !== undefined);
  const files = resultData[FILES_KEY];
  const evidence = resultData[EVIDENCE_KEY];
  const extras = Object.keys(resultData).filter(
    (key) =>
      !SUPPRESSED_KEYS.has(key) &&
      key !== FILES_KEY &&
      key !== EVIDENCE_KEY &&
      key !== "Schema version" &&
      // `$rich` nodes are the reporter's narrative, and they have their own
      // section above the analysis. Listing them here as well printed every
      // narrative section twice on one page — once where it belongs and once
      // under "Other findings", beside rows of numbers.
      !isRichTextNode(resultData[key]) &&
      !(KPI_KEYS as readonly string[]).includes(key) &&
      !(METADATA_KEYS as readonly string[]).includes(key)
  );
  const empty =
    kpis.length === 0 &&
    metadata.length === 0 &&
    extras.length === 0 &&
    files === undefined &&
    evidence === undefined;

  return (
    <section className="card overflow-hidden" aria-label="Report">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Report</p>
            {/* The report's database id is deliberately not shown. It is the
                same mistake the filing reference used to make: a uuid rendered
                as the thing a human reads, which is both unreadable and a leak
                of database identity into the interface. The id is still used
                underneath, to key the raw-document fetch. */}
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
        <div className="flex items-start gap-4">
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
          {/* The document is already a light-ink-on-paper layout under
              `@media print`, so the browser's own print command is the whole
              feature; the button is discoverability, and is hidden in the
              printed output because it has no meaning on paper. */}
          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center gap-1.5 rounded-[8px] border border-hairline bg-paper-raised px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print / save as PDF
          </button>
        </div>
      </div>

      {empty ? (
        <p className="px-5 py-6 text-sm text-muted">This report contains no result fields yet.</p>
      ) : (
        <>
          {kpis.length > 0 ? (
            <section className="border-b border-hairline px-5 py-4">
              <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Summary
              </h3>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {kpis.map((key) => {
                  const tone = key === "Data quality score" ? qualityTone(scalarText(resultData[key])) : null;
                  return (
                    <div key={key} className="card px-3.5 py-2.5">
                      <p className="text-[11px] leading-tight text-muted">{key}</p>
                      <p
                        className={`mt-1 font-mono text-[19px] leading-none tabular-nums ${
                          tone ? TONE_CLASS[tone] : "text-ink"
                        }`}
                      >
                        {scalarText(resultData[key])}
                      </p>
                    </div>
                  );
                })}
              </div>
              <FindingsCallout
                count={resultData["Findings requiring review"]}
                signal={resultData["Highest signal"]}
              />
            </section>
          ) : null}

          {metadata.length > 0 ? (
            <ReportSection title="Report details">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
                {metadata.map((key) => (
                  <React.Fragment key={key}>
                    <dt className="text-[12px] text-muted">{key}</dt>
                    <dd className="text-[12px] text-ink">
                      {key === "Analyzed at" ? fmtDateTime(scalarText(resultData[key])) : scalarText(resultData[key])}
                    </dd>
                  </React.Fragment>
                ))}
                {schemaVersion ? (
                  <>
                    <dt className="text-[12px] text-muted">Schema version</dt>
                    <dd className={`text-[12px] ${schemaMismatch ? "text-[var(--warning-text)]" : "text-ink"}`}>
                      {schemaVersion}
                      {schemaMismatch ? ` · this panel renders ${KNOWN_SCHEMA_VERSION}` : ""}
                    </dd>
                  </>
                ) : null}
              </dl>
            </ReportSection>
          ) : null}

          {extras.length > 0 ? (
            <ReportSection title="Other findings">
              <dl className="divide-y divide-hairline/60">
                {extras.map((key) => (
                  <ReportRow key={key} label={key} value={resultData[key]!} depth={0} />
                ))}
              </dl>
            </ReportSection>
          ) : null}

          {files !== undefined ? (
            <ReportSection title="Files">
              <FileBranches files={files} />
            </ReportSection>
          ) : null}

          {evidence !== undefined ? (
            <ReportSection title={EVIDENCE_KEY}>
              <ReportRow label={EVIDENCE_KEY} value={evidence} depth={0} />
            </ReportSection>
          ) : null}
        </>
      )}

      <RawDataToggle reportId={report.id} open={rawOpen} onToggle={setRawOpen} />
    </section>
  );
}

/** A titled band. Headings avoid a break so a title never orphans from its body. */
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline px-5 py-4 last:border-b-0">
      <h3 className="mb-2 break-after-avoid font-mono text-[10px] uppercase tracking-[0.14em] text-muted print:break-after-avoid">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * One section per file, titled the way the printable report titles them.
 *
 * The file branch used to be rendered at depth 0 inside a generic tree, so a
 * filing with several files produced one deeply-indented nest under a single
 * "Files" row — reaching depth 5 once a file had its own Column profile. Each
 * file is its own heading now, and its contents start again at depth 0.
 */
function FileBranches({ files }: { files: ReportNode }) {
  if (Array.isArray(files)) {
    return (
      <ol className="flex list-none flex-col gap-4 p-0">
        {files.map((file, index) => (
          <li key={index}>
            <FileBranch title={`File ${index + 1}`} value={file} />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof files !== "object" || files === null) {
    return <ReportRow label="Files" value={files} depth={0} />;
  }
  const names = Object.keys(files);
  if (names.length === 0) {
    return <p className="text-[13px] text-muted">No files were analysed.</p>;
  }
  return (
    <ol className="flex list-none flex-col gap-4 p-0">
      {names.map((name, index) => (
        <li key={name}>
          <FileBranch title={`File ${index + 1} — ${name}`} value={files[name]!} />
        </li>
      ))}
    </ol>
  );
}

function FileBranch({ title, value }: { title: string; value: ReportNode }) {
  return (
    <article className="card overflow-hidden print:break-inside-avoid">
      <h4 className="break-after-avoid border-b border-hairline bg-accent-soft px-4 py-2 text-[13px] font-medium text-ink print:break-after-avoid">
        {title}
      </h4>
      <dl className="divide-y divide-hairline/60">
        {typeof value === "object" && value !== null && !Array.isArray(value) ? (
          Object.entries(value).map(([label, child]) => (
            <ReportRow key={label} label={label} value={child} depth={0} />
          ))
        ) : (
          <ReportRow label={title} value={value} depth={0} />
        )}
      </dl>
    </article>
  );
}

/**
 * The headline a reviewer opens the report for: how many findings need a human,
 * and how loud the worst of them is.
 *
 * Only rendered when there is something to say. "0 findings, highest signal
 * None" is a fact, but printing it as a coloured callout reads as an alarm, and
 * a panel that cries wolf on a clean filing trains people to ignore the band.
 */
function FindingsCallout({ count, signal }: { count: ReportNode | undefined; signal: ReportNode | undefined }) {
  const countText = scalarText(count);
  const numeric = parseServiceNumber(countText);
  const signalText = scalarText(signal);
  const style = SEVERITY_STYLES[signalText.toLowerCase()];
  if ((numeric !== null && numeric <= 0) || (!style && (numeric === null || numeric === 0))) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-hairline bg-accent-soft px-3.5 py-2.5">
      <p className="text-[12px] text-ink">
        <span className="font-medium">{countText}</span>{" "}
        {numeric === 1 ? "finding needs" : "findings need"} review
      </p>
      {style ? (
        <span className={`stamp ${style.className}`}>{style.label}</span>
      ) : (
        <span className="font-mono text-[11px] text-muted">highest signal: {signalText}</span>
      )}
    </div>
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
  // Rich nodes are drawn, not tabulated. Checked before the branch case because
  // they *are* objects -- without this they would render as `$chart: "bar"`
  // followed by a nested list of every bar, which is the flattened form this
  // replaced.
  if (isChartNode(value)) {
    return (
      <div className="border-t border-hairline/60">
        <p className="truncate px-5 py-2 text-[13px] font-medium text-ink" title={label}>
          {label}
        </p>
        {value.$chart === "table" ? (
          <ReportTableChart columns={value.Columns ?? []} rows={value.Rows ?? []} />
        ) : (
          <ReportBarChart bars={value.Bars ?? []} total={value.Total} />
        )}
      </div>
    );
  }

  if (isForecastNode(value)) {
    return (
      <div className="border-t border-hairline/60">
        <p className="truncate px-5 py-2 text-[13px] font-medium text-ink" title={label}>
          {label}
        </p>
        <ReportForecastChart
          history={value.History ?? []}
          projected={value.Projected ?? []}
          series={value.Series}
          method={value.Method}
        />
        {/* The accuracy and interval metadata sits under the chart rather than
            in the header: the drawing is what a reader looks at, and these are
            the qualifiers on how far to trust it. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-5 pb-2 text-[12px]">
          {value.Horizon ? <dt className="text-muted">Horizon</dt> : null}
          {value.Horizon ? <dd className="text-ink">{value.Horizon}</dd> : null}
          {value.Confidence ? <dt className="text-muted">Confidence</dt> : null}
          {value.Confidence ? <dd className="text-ink">{value.Confidence}</dd> : null}
          {value["Method note"] ? <dt className="text-muted">Method</dt> : null}
          {value["Method note"] ? (
            <dd className="text-ink">
              {value.Method} — {value["Method note"]}
            </dd>
          ) : null}
          {/* One pass rather than two: a `<dl>` needs the term before its
              description, and pairing them per entry keeps them adjacent when
              the order changes. */}
          {Object.entries(value.Accuracy ?? {}).map(([key, metric]) => (
            <React.Fragment key={key}>
              <dt className="text-muted">{key}</dt>
              <dd className="font-mono tabular-nums text-ink">{String(metric)}</dd>
            </React.Fragment>
          ))}
        </dl>
        {value.Notes?.length ? (
          <ReportNotes
            notes={value.Notes.map((note) => ({
              Severity: "info",
              Subject: "Forecast",
              Detail: note,
            }))}
          />
        ) : null}
      </div>
    );
  }

  if (isRichTextNode(value)) {
    return (
      <div className="border-t border-hairline/60">
        <ReportRichText content={value.$rich.content} title={value.$rich.title ?? label} />
      </div>
    );
  }

  if (isNotesNode(value)) {
    return (
      <div className="border-t border-hairline/60">
        <p className="truncate px-5 py-2 text-[13px] font-medium text-ink" title={label}>
          {label}
        </p>
        <div className="px-5 pb-3">
          <ReportNotes notes={value.$notes} />
        </div>
      </div>
    );
  }

  if (isBranch(value)) {
    const children: [string, ReportNode][] = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as [string, ReportNode])
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
          content, so without it a long label pushes the value off the panel
          rather than ellipsising. A service projection keys its per-file
          branches by filename, and those really are Arabic in the sample
          corpus (`اصناف لم تباع.xls`), so this is the common case rather than
          a hypothetical one — leaves reach depth 5 once a file has an Insights
          or Column profile branch. `title` keeps the full name reachable. The
          value caps at 60% so a long finding string wraps instead of squeezing
          every label away. */}
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
