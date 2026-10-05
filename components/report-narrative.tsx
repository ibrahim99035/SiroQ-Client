"use client";

import * as React from "react";
import { AlertCircle, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/components/session-provider";
import { updateReport } from "@/lib/data";
import { can } from "@/lib/permissions";
import {
  blocksEqual,
  mergeRichTextBlocks,
  resultDataToBlocks,
  pdfAttachments,
  type FilingFileRow,
  type PdfAttachment,
  type RichTextBlock,
} from "@/lib/report-blocks";
import type { Report } from "@/lib/types";
import { ReportRichBlocks } from "@/components/report-rich-blocks";

/**
 * The reporter-authored narrative, above the analysis.
 *
 * This is the prose half of a report: what the reviewer concluded, in words,
 * as opposed to the counts and charts the service derives. It sits before the
 * analysis panel rather than after it because a reader meets the argument
 * before the evidence — and because a narrative written *about* an analysis
 * reads better when the analysis it refers to is still on screen below.
 *
 * Blocks live inside the report's own `resultData`, so this section only exists
 * once a filing has a report. A filing with none gets the panel's existing
 * explanation of how to produce one instead of an empty editor.
 */
export function ReportNarrative({
  report,
  onSaved,
  files,
}: {
  report: Report;
  onSaved: () => void | Promise<void>;
  /** The filing's uploaded files, so a section can quote a PDF from them. */
  files?: FilingFileRow[];
}) {
  const user = useCurrentUser();
  const editable = user ? can(user, "editReport") : false;

  // The picker only ever offers a document the reader could open from the ledger
  // anyway, so this is derived rather than fetched: quoting a PDF is a reference
  // to a file the filing already holds, never an upload of its own.
  const pdfs: PdfAttachment[] = React.useMemo(() => pdfAttachments(files), [files]);

  const persisted = React.useMemo(
    () => resultDataToBlocks(report.resultData ?? {}),
    [report.resultData],
  );

  const [draft, setDraft] = React.useState<RichTextBlock[]>(persisted);
  const [state, setState] = React.useState<
    { status: "idle" } | { status: "saving" } | { status: "saved" } | { status: "error"; message: string }
  >({ status: "idle" });

  // Discarded during render rather than in an effect keyed on the document: the
  // narrative belongs to the report, and the render that swaps reports is the
  // right moment to drop the previous filing's unsaved draft. Without this, a
  // save followed by a reload would leave the editor holding stale blocks and
  // still reporting unsaved changes.
  const [lastDocument, setLastDocument] = React.useState(report.resultData);
  if (report.resultData !== lastDocument) {
    setLastDocument(report.resultData);
    setDraft(persisted);
    setState({ status: "idle" });
  }

  const dirty = !blocksEqual(draft, persisted);

  const save = async () => {
    setState({ status: "saving" });
    try {
      // The whole document goes back, not just the blocks: the route replaces
      // `resultData` wholesale, and `mergeRichTextBlocks` is what carries the
      // service's own keys through untouched.
      await updateReport(report.id, mergeRichTextBlocks(report.resultData ?? {}, draft), user!);
      await onSaved();
      setState({ status: "saved" });
    } catch (reason) {
      // Surfaced rather than swallowed. Losing a reviewer's prose to a failed
      // save with no message is the one failure this section cannot have.
      setState({
        status: "error",
        message: reason instanceof Error ? reason.message : "The narrative could not be saved.",
      });
    }
  };

  // Nothing to read and nothing to add: an empty titled band is worse than
  // absence, and a filing whose report carries no prose is common.
  if (persisted.length === 0 && !editable) return null;

  return (
    <section className="card px-5 py-4" aria-label="Report narrative">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="break-after-avoid font-mono text-[10px] uppercase tracking-[0.14em] text-muted print:break-after-avoid">
          Narrative
        </h3>
        {editable ? (
          <div className="flex items-center gap-2">
            {/* Saved is transient and self-clearing: it confirms the write
                landed without leaving a badge that has to be dismissed, and
                without implying the section is still in a special state. */}
            {state.status === "saved" && !dirty ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Saved
              </span>
            ) : null}
            <Button
              size="sm"
              variant={dirty ? "warm" : "outline"}
              disabled={!dirty || state.status === "saving"}
              onClick={() => void save()}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {state.status === "saving" ? "Saving…" : "Save narrative"}
            </Button>
          </div>
        ) : null}
      </div>

      {persisted.length === 0 && editable ? (
        <p className="mb-3 text-[13px] text-muted">
          No narrative yet. Add a section to record what this filing means in words — the counts
          and charts below are produced by the analysis, and are not a substitute for a conclusion.
        </p>
      ) : null}

      <ReportRichBlocks blocks={draft} onChange={setDraft} editable={editable} pdfs={pdfs} />

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-3 inline-flex items-center gap-1.5 border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[var(--danger-text)]"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
