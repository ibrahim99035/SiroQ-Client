"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/utils";
import type { Report } from "@/lib/types";

/**
 * Report panel. Renders `report.resultData` generically as a two-column
 * label/value list — nothing is hardcoded, because the real shape arrives
 * later from the reference service. Raw data is one collapsed toggle away.
 */
export function ReportPanel({ report }: { report: Report }) {
  const users = useAppStore((s) => s.users);
  const [rawOpen, setRawOpen] = React.useState(false);
  const entries = Object.entries(report.resultData);
  const generatedBy = users.find((u) => u.id === report.generatedBy)?.name ?? "System";

  return (
    <section className="card overflow-hidden" aria-label="Report">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Report</p>
          <p className="font-mono text-sm text-ink">{report.id}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-muted">Generated {fmtDateTime(report.generatedAt)}</p>
          <p className="font-mono text-[11px] text-muted">by {generatedBy}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">
          This report contains no result fields yet.
        </p>
      ) : (
        <dl className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {entries.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-5 py-2.5">
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="text-right font-mono text-[13px] tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="border-t border-hairline px-5 py-3">
        <button
          type="button"
          onClick={() => setRawOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          aria-expanded={rawOpen}
        >
          {rawOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          Raw reference data
        </button>
        {rawOpen ? (
          <pre className="raw-json mt-3" data-testid="raw-report">
            {report.rawData}
          </pre>
        ) : null}
      </div>
    </section>
  );
}