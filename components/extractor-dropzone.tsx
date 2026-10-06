"use client";

import * as React from "react";
import { UploadCloud, X } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { EXTRACTOR_EXTENSIONS } from "@/lib/file-types";

export function ExtractorDropzone({
  onFile,
}: {
  onFile: (file: File | null) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const stage = (f: File | null) => {
    setFile(f);
    onFile(f);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
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
          if (e.dataTransfer.files[0]) stage(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-card border border-dashed bg-paper-raised px-6 py-10 text-center shadow-soft transition-colors",
          dragging ? "border-accent bg-accent-muted" : "border-hairline",
        )}
      >
        <UploadCloud className="h-6 w-6 text-accent" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Drop a PDF or HTML file here, or click to browse</p>
        <p className="font-mono text-[11px] text-muted">{[...EXTRACTOR_EXTENSIONS].join(" · ")}</p>
        {file ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span>{file.name}</span>
            <span>·</span>
            <span>{formatBytes(file.size)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                stage(null);
              }}
              className="rounded p-1 hover:bg-surface"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={[...EXTRACTOR_EXTENSIONS].join(",")}
        className="sr-only"
        onChange={(e) => stage(e.target.files?.[0] || null)}
      />
    </div>
  );
}
