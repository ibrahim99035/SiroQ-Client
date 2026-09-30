"use client";

import * as React from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SUPPORTED_EXTENSIONS, validateUpload, type UploadCandidate } from "@/lib/files";
import { cn, formatBytes } from "@/lib/utils";

interface StagedFile {
  key: string;
  candidate: UploadCandidate;
  progress: number;
}

/**
 * Multi-file dropzone. Extension gate + simulated content validation happen
 * here per file; every rejection carries a real sentence. Progress is
 * simulated but visible per file.
 */
export function FileDropzone({
  onFilesChange,
}: {
  onFilesChange: (files: UploadCandidate[]) => void;
}) {
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const stageFiles = (fileList: FileList | File[]) => {
    const next: StagedFile[] = [];
    Array.from(fileList).forEach((file) => {
      // The handle travels with the candidate: the upload itself needs the real
      // bytes, and re-deriving them later from `fileName` is impossible.
      const candidate = validateUpload(file.name, file.size, file);
      next.push({ key: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, candidate, progress: 0 });
    });
    const merged = [...staged, ...next];
    setStaged(merged);
    onFilesChange(reportAccepted(merged));
    next.forEach((entry) => simulateUpload(entry.key));
  };

  const simulateUpload = (key: string) => {
    const tick = () => {
      const current = stagedRef.current.find((s) => s.key === key);
      if (!current) return;
      const nextProgress = Math.min(100, current.progress + 7 + Math.floor(Math.random() * 14));
      const updated = stagedRef.current.map((s) => (s.key === key ? { ...s, progress: nextProgress } : s));
      setStaged(updated);
      if (nextProgress < 100) {
        timers.current.push(window.setTimeout(tick, 120 + Math.floor(Math.random() * 90)));
      } else {
        onFilesChange(reportAccepted(updated));
      }
    };
    timers.current.push(window.setTimeout(tick, 150));
  };

  const stagedRef = React.useRef<StagedFile[]>([]);
  // Mirrored in an effect rather than during render: the simulated progress
  // timers below read the latest staged list from this ref, but mutating a ref
  // while rendering is not allowed.
  React.useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  const removeFile = (key: string) => {
    const updated = staged.filter((s) => s.key !== key);
    setStaged(updated);
    onFilesChange(reportAccepted(updated));
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload filing files — .xlsx or .csv only"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          stageFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed bg-paper-raised px-6 py-10 text-center shadow-soft transition-colors",
          dragging ? "border-accent bg-accent-muted" : "border-hairline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <UploadCloud className="h-6 w-6 text-accent" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Drop dispensing files here, or click to browse</p>
        <p className="font-mono text-[11px] text-muted">
          Accepted: {SUPPORTED_EXTENSIONS.map((e) => e).join(" · ")}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.csv"
        className="sr-only"
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files) stageFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      {staged.length > 0 ? (
        <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
          {staged.map((entry) => {
            const { candidate, progress } = entry;
            const rejected = candidate.kind === null;
            const isUploading = progress < 100 && !rejected;
            return (
              <li key={entry.key} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] text-ink">{candidate.fileName}</p>
                    {/* Byte size only. Row and column counts used to be shown
                        here, but they came from `simulateFileValidation`, which
                        invents them from the file name — a 5-row, 6-column CSV
                        was cheerfully labelled "16 rows · 5 cols". The real
                        figures are read back from storage after the upload and
                        are what the ledger shows. */}
                    <p className="font-mono text-[11px] text-muted">
                      {formatBytes(candidate.sizeBytes)}
                    </p>
                    <div className="mt-2">
                      {isUploading ? (
                        <Progress value={progress} aria-label={`Uploading ${candidate.fileName}`} />
                      ) : (
                        <FileStatus candidate={candidate} rejected={rejected} />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(entry.key)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-stamp text-muted transition-colors hover:bg-accent-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={`Remove ${candidate.fileName}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {staged.some((s) => s.candidate.kind === null) ? (
        <p role="alert" className="mt-3 border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[#7a2e26]">
          One or more files were rejected for the wrong file type. Remove them before submitting.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The only verdict available before the upload is "wrong extension", which is a
 * fact about the name the browser already has. Everything else is deliberately
 * unsaid: the schema result, row count and column count are all derived from the
 * stored bytes in `POST /api/uploads/[id]/complete`, and the previous
 * implementation showed a confident "All rows passed schema checks" here for a
 * file it had never opened.
 */
function FileStatus({ candidate, rejected }: { candidate: UploadCandidate; rejected: boolean }) {
  if (rejected) {
    return (
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[#7a2e26]">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-rejected-fill)]" aria-hidden="true" />
        {candidate.reason}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-muted">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#245c42]" aria-hidden="true" />
      Queued. Contents are checked on the server once the file is stored.
    </p>
  );
}

function reportAccepted(staged: StagedFile[]): UploadCandidate[] {
  return staged.filter((s) => s.candidate.kind !== null).map((s) => s.candidate);
}