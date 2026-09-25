import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { formatBytes, fmtDate } from "@/lib/utils";
import type { ApplicationFile, FileValidationState } from "@/lib/types";

const STATE_META: Record<
  FileValidationState,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: { label: "Passed", icon: CheckCircle2, className: "text-[#245c42]" },
  warning: { label: "Advisory", icon: AlertTriangle, className: "text-[#7a5c08]" },
  invalid: { label: "Failed", icon: XCircle, className: "text-[#9c3c30]" },
};

/**
 * File ledger: every staged file with per-file validation, shown as a ruled
 * table. The reason string is always a real sentence, never a bare icon.
 */
export function FileLedger({ files }: { files: ApplicationFile[] }) {
  return (
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
              <th>Rows</th>
              <th>Cols</th>
              <th className="min-w-[220px]">Detected columns</th>
              <th className="min-w-[240px]">Validation</th>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}