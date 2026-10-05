"use client";

import * as React from "react";
import { ExternalLink, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Reads a PDF held on a filing and shows it over the report.
 *
 * The bytes are fetched and handed to the frame as a blob URL rather than by
 * pointing an `<iframe>` at the download path. That is not incidental: the
 * content route serves every file with `Content-Disposition: attachment` and
 * `X-Content-Type-Options: nosniff`, so a frame pointed straight at it would be
 * handed a download instead of a document. Pulling the bytes through `fetch`
 * first leaves the response headers exactly as strict as they are — no route
 * change, no new endpoint, and no way to get inline rendering of an upload the
 * authorization check would otherwise refuse — while still giving the reader a
 * viewer.
 */

/** Refuse to pull something enormous into memory just to preview it. */
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;

type Preview =
  | { state: "loading" }
  | { state: "ready"; objectUrl: string }
  | { state: "failed"; message: string };

/**
 * Mounted only while the dialog is open, so each opening starts from a clean
 * fetch with nothing to reset: the previous document's state went out of scope
 * with the component, including the object URL.
 */
function PdfPreview({ url }: { url: string }) {
  const [preview, setPreview] = React.useState<Preview>({ state: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();
    let created: string | null = null;

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          setPreview({
            state: "failed",
            message:
              response.status === 404
                ? "This document is no longer on the filing. It may have been deleted."
                : `The document could not be loaded (HTTP ${response.status}).`,
          });
          return;
        }
        // Checked before and after reading: the header is the server's claim and
        // the blob is what actually arrived, and only the second one is real.
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (declared > MAX_PREVIEW_BYTES) {
          setPreview({
            state: "failed",
            message: "This document is too large to preview. Download it instead.",
          });
          return;
        }
        const blob = await response.blob();
        if (blob.size > MAX_PREVIEW_BYTES) {
          setPreview({
            state: "failed",
            message: "This document is too large to preview. Download it instead.",
          });
          return;
        }
        created = URL.createObjectURL(blob);
        setPreview({ state: "ready", objectUrl: created });
      } catch (reason) {
        // An abort is this effect cleaning up after itself, not a failure worth
        // putting in front of the reader.
        if (controller.signal.aborted) return;
        setPreview({
          state: "failed",
          message:
            reason instanceof Error && reason.message
              ? reason.message
              : "The document could not be loaded.",
        });
      }
    })();

    return () => {
      controller.abort();
      // An object URL pins the whole file in memory until it is released, and
      // nothing but this releases it. A report full of citations would otherwise
      // hold on to every PDF the reader ever opened.
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (preview.state === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading document…</span>
      </div>
    );
  }

  if (preview.state === "failed") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <FileWarning className="h-6 w-6 text-muted" aria-hidden="true" />
        <p className="text-sm text-ink">{preview.message}</p>
      </div>
    );
  }

  return (
    <iframe
      src={preview.objectUrl}
      title="Document preview"
      className="h-[60vh] w-full rounded-md border border-hairline/60"
    />
  );
}

export function PdfViewerDialog({
  open,
  onOpenChange,
  filename,
  url,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  url: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-all pr-8">{filename}</DialogTitle>
          <DialogDescription>
            Preview of the document stored on this filing.
          </DialogDescription>
        </DialogHeader>

        {open && url ? <PdfPreview url={url} /> : null}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={!url}
            onClick={() => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}