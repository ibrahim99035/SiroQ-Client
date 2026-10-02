import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, fmtDate } from "@/lib/utils";
import type { ApplicationFile, FileValidationState } from "@/lib/types";

const STATE_META: Record<
  FileValidationState,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: { label: "Passed", icon: CheckCircle2, className: "text-[var(--success-text)]" },
  warning: { label: "Advisory", icon: AlertTriangle, className: "text-[var(--warning-text)]" },
  invalid: { label: "Failed", icon: XCircle, className: "text-[var(--status-rejected-fill)]" },
};

/**
 * File ledger: every staged file with per-file validation, shown as a ruled
 * table. The reason string is always a real sentence, never a bare icon.
 *
 * The download column needs no permission branch of its own. Authorization for
 * a filing's bytes is exactly authorization to see the filing, and `verify:authz`
 * already pins that down per role — so a caller who reached this page can
 * download, and one who did not never gets here. The route answers 404 rather
 * than 403 for out-of-scope ids, so there is nothing here to leak by omission.
 *
 * A plain anchor, not `fetch` + blob: the route sends `Content-Disposition:
 * attachment`, so the browser downloads natively, streams a 50 MB workbook
 * straight to disk, and works with JavaScript disabled.
 */
export function FileLedger({ files }: { files: ApplicationFile[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
      {files.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted">
          No files are staged in this ledger. Attach a file to begin a filing.
        </p>
      ) : (
        <table className="ruled-table min-w-[840px]">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Kind</th>
              <th>Rows</th>
              <th>Cols</th>
              <th className="min-w-[220px]">Detected columns</th>
              <th className="min-w-[240px]">Validation</th>
              <th className="w-[124px] text-right">
                <span className="sr-only">Download</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const meta = STATE_META[file.validationState];
              const Icon = meta.icon;
              return (
                <tr key={file.id} className="align-top">
                  <td className="max-w-[280px]">
                    <span className="block truncate font-mono text-[12px] text-ink" title={file.filename}>
                      {file.filename}
                    </span>
                    <span className="block font-mono text-[11px] text-muted">
                      {formatBytes(file.sizeBytes)} · {fmtDate(file.uploadedAt)}
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted">
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                      {file.kind === "xlsx" ? "xlsx" : "csv"}
                    </span>
                  </td>
                  <td className="font-mono text-[12px]">{file.rowCount.toLocaleString("en-US")}</td>
                  <td className="font-mono text-[12px]">{file.columnCount}</td>
                  <td>
                    <span className="block max-w-[240px] truncate font-mono text-[11px] text-muted" title={file.detectedColumns.join(", ")}>
                      {file.detectedColumns.join(", ")}
                    </span>
                  </td>
                  <td>
                    <p className="flex items-start gap-1.5">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`} aria-label={`${meta.label} — ${file.validationReason}`} />
                      <span className="text-[12px] leading-snug text-ink">{file.validationReason}</span>
                    </p>
                  </td>
                  <td className="text-right align-middle">
                    {file.downloadable ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={file.downloadUrl}>
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}