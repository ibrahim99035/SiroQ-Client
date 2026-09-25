"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { useAppStore, useCurrentUser, useRevision } from "@/lib/store";
import { cn } from "@/lib/utils";

const schema = z.object({
  note: z
    .string()
    .max(240, "Keep the note under 240 characters.")
    .optional()
    .or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

/**
 * Super admin's "Attach Report" action. Client-side form (react-hook-form +
 * zod) that mutates the mock layer; the filing flips to `reported` and every
 * scoped view re-renders via the store revision.
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
  useRevision();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { note: "" },
  });

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      attachReport(applicationId, user, { affirmIssues: values.note });
      form.reset();
      onCompleted?.();
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be attached.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach report</DialogTitle>
          <DialogDescription>
            Generates a review report from the ledger metadata and advances this filing to{" "}
            <span className="font-mono text-[11px] text-ink">reported</span>. Result fields come
            from the reference service; raw data is attached alongside.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-note">Work order note (optional)</Label>
            <Textarea
              id="report-note"
              placeholder="e.g. Forward to compliance for scheduling review."
              {...form.register("note")}
            />
            {form.formState.errors.note ? (
              <p className="text-xs text-[var(--status-rejected-fill)]">
                {form.formState.errors.note.message}
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[#7a2e26]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="warm"
              disabled={busy}
              className={cn(busy && "pointer-events-none opacity-60")}
            >
              {busy ? "Attaching…" : "Attach report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}