"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Paperclip,
  PencilLine,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/client-api";
import {
  addFilesToApplication,
  deleteApplicationFile,
  PartialAttachmentError,
  replaceApplicationFile,
} from "@/lib/data";
import { kindLabelForName, SUPPORTED_EXTENSIONS } from "@/lib/file-types";
import { useSession } from "@/components/session-provider";
import { formatBytes, fmtDate } from "@/lib/utils";
import type { ApplicationFile, FileValidationState } from "@/lib/types";

const STATE_META: Record<
  FileValidationState,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: {
    label: "Passed",
    icon: CheckCircle2,
    className: "text-[var(--success-text)]",
  },
  warning: {
    label: "Advisory",
    icon: AlertTriangle,
    className: "text-[var(--warning-text)]",
  },
  invalid: {
    label: "Failed",
    icon: XCircle,
    className: "text-[var(--status-rejected-fill)]",
  },
};

/**
 * File ledger: every file on the filing with per-file validation.
 *
 * `Rows`, `Cols` and `Detected columns` are deliberately not rendered. The
 * numbers behind them come from `inspectBytes`, which reads CSV text directly
 * but for `.xlsx`/`.xls` only checks the container signature and reports zero
 * rows and no columns — so for a workbook the ledger claimed "0 rows, 0
 * columns" on a file with thousands of them, which is worse than showing
 * nothing. The fields stay on the row, still populated from the bytes on
 * intake, so hiding the column is reversible the moment a real workbook parser
 * lands; the ledger then reads them again. A UI that renders a wrong number
 * cannot be un-shipped the way a hidden one can.
 *
 * Download needs no permission branch: authorization for a filing's bytes is
 * authorization to see the filing. Replace and remove are different — they
 * mutate the evidence a review was performed on — so they are offered only
 * where `editable` came back true, and the route re-derives the same rule
 * regardless of what this component drew.
 *
 * The download link is a plain anchor, not `fetch` + blob: the route sends
 * `Content-Disposition: attachment`, so the browser downloads natively, streams
 * a 50 MB workbook straight to disk, and works with JavaScript disabled.
 */
export function FileLedger({
  files,
  applicationId,
  canAddFiles,
  onChanged,
}: {
  files: ApplicationFile[];
  applicationId: string;
  /** Server-derived: submitter, prior uploader, or super admin. */
  canAddFiles?: boolean;
  /** Reloads the filing. Every mutation here changes the custody log and the
   *  uploader, neither of which this component can patch into its own props. */
  onChanged?: () => void;
}) {
  const { user } = useSession();
  const [pendingFileId, setPendingFileId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const fileInputs = useRef(new Map<string, HTMLInputElement>());

  async function onAddPicked(input: HTMLInputElement) {
    const picked = Array.from(input.files ?? []);
    // Same reason as the per-row replace input: leaving the value set would make
    // re-picking the identical file a silent no-op.
    input.value = "";
    if (picked.length === 0 || !user) return;

    setError(null);
    setAdding(true);
    try {
      // Always reload, including on a partial failure: the caller re-reads the
      // filing either way, and the files that did land must appear.
      await addFilesToApplication(applicationId, picked);
      onChanged?.();
    } catch (cause) {
      onChanged?.();
      setError(
        cause instanceof ApiError || cause instanceof PartialAttachmentError
          ? cause.message
          : "The files could not be attached. Please try again.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function onPick(file: ApplicationFile, input: HTMLInputElement) {
    const picked = input.files?.[0];
    // Reset immediately: picking the same file twice in a row has to re-fire
    // `change`, and leaving the value set would silently do nothing.
    input.value = "";
    if (!picked || !user) return;

    setError(null);
    setPendingFileId(file.id);
    try {
      await replaceApplicationFile(applicationId, file.id, picked, user);
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : `${picked.name} could not be uploaded. Please try again.`,
      );
    } finally {
      setPendingFileId(null);
    }
  }

  async function onDelete(file: ApplicationFile) {
    if (!user) return;
    setConfirmingId(null);
    setError(null);
    setPendingFileId(file.id);
    try {
      await deleteApplicationFile(applicationId, file.id, user);
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : `${file.filename} could not be removed.`,
      );
    } finally {
      setPendingFileId(null);
    }
  }

  return (
    <div>
      {canAddFiles ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-muted">
            Attach another dispensing ledger, or supporting evidence such as a
            Power BI or Tableau file. Ledgers are analysed; other formats are
            stored with this filing.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={addInput}
              type="file"
              multiple
              accept={SUPPORTED_EXTENSIONS.join(",")}
              className="sr-only"
              aria-hidden="true"
              onChange={(event) => {
                const input = event.currentTarget;
                void onAddPicked(input);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={adding}
              onClick={() => addInput.current?.click()}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {adding ? "Attaching…" : "Add files"}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
        {files.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted">
            No files are staged in this ledger. Attach a file to begin a filing.
          </p>
        ) : (
          <table className="ruled-table min-w-[720px]">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Kind</th>
                <th className="min-w-[240px]">Validation</th>
                <th className="w-[124px] text-right">
                  <span className="sr-only">Download</span>
                </th>
                {files.some((file) => file.editable) ? (
                  <th className="w-[168px] text-right">
                    <span className="sr-only">Replace or remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const meta = STATE_META[file.validationState];
                const Icon = meta.icon;
                const busy = pendingFileId === file.id;
                return (
                  <tr key={file.id} className="align-top">
                    <td className="max-w-[280px]">
                      <span
                        className="block truncate font-mono text-[12px] text-ink"
                        title={file.filename}
                      >
                        {file.filename}
                      </span>
                      <span className="block font-mono text-[11px] text-muted">
                        {formatBytes(file.sizeBytes)} ·{" "}
                        {fmtDate(file.uploadedAt)}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                        {file.kind === "attachment" ? (
                          <Paperclip
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileSpreadsheet
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        {file.kind === "csv"
                          ? "csv"
                          : file.kind === "attachment"
                            ? kindLabelForName(file.filename)
                            : "xls/xlsx"}
                      </span>
                    </td>
                    <td>
                      <p className="flex items-start gap-1.5">
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`}
                          aria-label={`${meta.label} — ${file.validationReason}`}
                        />
                        <span className="text-[12px] leading-snug text-ink">
                          {file.validationReason}
                        </span>
                      </p>
                    </td>
                    <td className="text-right align-middle">
                      {file.downloadable ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={file.downloadUrl}>
                            <Download
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            Download
                            <span className="sr-only"> {file.filename}</span>
                          </a>
                        </Button>
                      ) : (
                        // A seeded fixture holds metadata but no bytes. Saying so beats
                        // offering a button that answers 404 every time it is pressed.
                        <span className="text-[12px] text-muted-foreground">
                          No file stored
                          <span className="sr-only"> for {file.filename}</span>
                        </span>
                      )}
                    </td>
                    {files.some((candidate) => candidate.editable) ? (
                      <td className="text-right align-middle">
                        {file.editable ? (
                          confirmingId === file.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => onDelete(file)}
                              >
                                Confirm
                                <span className="sr-only">
                                  {" "}
                                  removing {file.filename}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmingId(null)}
                              >
                                Keep
                              </Button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  const input = fileInputs.current.get(file.id);
                                  if (input) input.click();
                                }}
                              >
                                <PencilLine
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Replace
                                <span className="sr-only">
                                  {" "}
                                  {file.filename}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => setConfirmingId(file.id)}
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Remove
                                <span className="sr-only">
                                  {" "}
                                  {file.filename}
                                </span>
                              </Button>
                            </span>
                          )
                        ) : (
                          <span className="text-[12px] text-muted-foreground">
                            —
                          </span>
                        )}
                        {/* One input per row, driven by the Replace button rather
                            than a visible control: the native picker is the only
                            way to get a real `File`, and `accept` mirrors the
                            server's `classify`, which rejects anything else with a
                            400 the operator would not understand. */}
                        <input
                          ref={(node) => {
                            if (node) fileInputs.current.set(file.id, node);
                            else fileInputs.current.delete(file.id);
                          }}
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls,.csv"
                          onChange={(event) =>
                            onPick(file, event.currentTarget)
                          }
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 text-[12px] text-[var(--status-rejected-fill)]"
        >
          {error}
        </p>
      ) : null}
      {files.length > 0 && files.some((file) => file.editable) ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Replacing a file keeps one ledger entry and records the previous
          version in the chain of custody below. Removal is recorded the same
          way and cannot be undone from here.
        </p>
      ) : null}
    </div>
  );
}
