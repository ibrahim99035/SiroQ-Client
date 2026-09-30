"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { attachReport } from "@/lib/data";
import { useCurrentUser } from "@/components/session-provider";

/** Mirrors the server's own limit so an oversized file is refused before upload. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/**
 * Super admin's "Attach report" action.
 *
 * The document is chosen here and parsed by the server. This used to call a
 * mock that synthesised a plausible-looking report from the ledger metadata —
 * "Data quality score 94.2%", a grade, a schema version — and stamped the
 * filing `reported` in the client store. Nothing about that number came from
 * anywhere, which for the artefact a pharmacy actually receives is worse than
 * having no report at all.
 */
export function AttachReportDialog({
  applicationId,
  onCompleted,
  open,
  onOpenChange,
}: {
  applicationId: string;
  onCompleted?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Cleared on close so a refused attempt does not leave the previous document
   * staged behind a fresh dialog. Done in the close path rather than an effect
   * on `open`: an effect that resets state runs after the render that opens the
   * dialog, so the empty state would flash and every such effect re-renders the
   * tree it was meant to leave alone.
   */
  const close = React.useCallback(() => {
    setFile(null);
    setNote("");
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    onOpenChange(false);
  }, [onOpenChange]);

  const pick = (candidate: File | null) => {
    setError(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!/\.json$/i.test(candidate.name)) {
      setFile(null);
      setError("The report document must be a .json file.");
      return;
    }
    if (candidate.size > MAX_DOCUMENT_BYTES) {
      setFile(null);
      setError(
        `That document is ${Math.round(candidate.size / 1024)} KB. The limit is 4096 KB.`,
      );
      return;
    }
    setFile(candidate);
  };

  const onSubmit = async () => {
    if (!user) return;
    if (!file) {
      setError("Choose the report document to attach.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await attachReport(applicationId, user, {
        document: await file.text(),
        status: "final",
        note: note.trim() || undefined,
      });
      onCompleted?.();
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be attached.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach report</DialogTitle>
          <DialogDescription>
            Uploads the review document for this filing and advances it to{" "}
            <span className="font-mono text-[11px] text-ink">reported</span>. The document is
            stored as attached and read back as the same document, re-indented for
            reading; nested results render in the panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-document">Report document</Label>
            <input
              ref={inputRef}
              id="report-document"
              type="file"
              accept="application/json,.json"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-ink file:mr-3 file:rounded-stamp file:border file:border-hairline file:bg-paper-raised file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
            />
            <p className="text-xs text-muted">
              {file
                ? `${file.name} · ${Math.round(file.size / 1024)} KB`
                : "A JSON object, up to 4096 KB. Parsed and validated on the server."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-note">Work order note (optional)</Label>
            <Textarea
              id="report-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Forward to compliance for scheduling review."
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[var(--danger-text)]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="warm" disabled={busy || !file} onClick={() => void onSubmit()}>
            {busy ? "Attaching…" : "Attach report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
