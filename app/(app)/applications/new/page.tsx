"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeading } from "@/components/page-heading";
import { PermissionGate } from "@/components/permission-gate";
import { FileDropzone } from "@/components/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResource } from "@/components/use-resource";
import {
  createApplication,
  fetchPharmaciesForUser,
  PartialSubmissionError,
} from "@/lib/data";
import { dataScope } from "@/lib/permissions";
import type { UploadCandidate } from "@/lib/files";
import { useCurrentUser } from "@/components/session-provider";
import { fmtDate } from "@/lib/utils";

const candidateSchema = z.object({
  fileName: z.string(),
  sizeBytes: z.number(),
  kind: z.enum(["xlsx", "csv"]).nullable(),
  state: z.enum(["valid", "warning", "invalid"]),
  reason: z.string(),
  rowCount: z.number(),
  columnCount: z.number(),
  detectedColumns: z.array(z.string()),
  // The staged bytes themselves. Optional because the seeded fixtures describe
  // files that exist nowhere on disk, and because the `typeof File` guard keeps
  // this module safe to evaluate during SSR, where a bare `File` reference would
  // throw at import time on a runtime without the global.
  file: z.custom<File>((value) => typeof File !== "undefined" && value instanceof File).optional(),
});

const schema = z.object({
  title: z.string().min(4, "Give the filing a descriptive title.").max(160),
  pharmacyId: z.string().min(1, "Choose the pharmacy this filing belongs to."),
  files: z
    .array(candidateSchema)
    .min(1, "Stage at least one .xlsx or .csv file.")
    .refine(
      (files) => files.every((f) => f.kind !== null),
      { message: "Remove rejected files before submitting." },
    ),
});
type FormValues = z.infer<typeof schema>;

export default function NewApplicationPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const pharmacies = useResource(
    () => fetchPharmaciesForUser(user!),
    [user?.id],
  );

  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [partialFiling, setPartialFiling] = React.useState<{
    id: string;
    reference: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", pharmacyId: "", files: [] },
  });

  const worker = user ? dataScope(user) === "pharmacy" : false;
  const workerPharmacy = worker ? pharmacies.data?.[0] : null;

  // A worker's pharmacy is shown read-only, so the <Select> that would normally
  // set this field never renders and the value has to come from their scope.
  // Without this the form submits `pharmacyId: ""`, zod rejects it, and — since
  // the field's error message also only renders in the non-worker branch — the
  // submit button simply does nothing, with no explanation anywhere.
  React.useEffect(() => {
    if (worker && workerPharmacy) {
      form.setValue("pharmacyId", workerPharmacy.pharmacy.id, { shouldValidate: true });
    }
  }, [worker, workerPharmacy, form]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setBusy(true);
    setSubmitError(null);
    setPartialFiling(null);
    try {
      // The real `File` handles, not the staged metadata. Row counts, byte
      // totals and validation shown on this form come from the server after the
      // upload, so nothing derived here is persisted.
      const files = values.files
        .map((candidate) => candidate.file)
        .filter((file): file is File => file instanceof File);
      if (files.length !== values.files.length) {
        throw new Error("One of the staged files could not be read. Please add it again.");
      }
      const application = await createApplication(
        { title: values.title.trim(), pharmacyId: values.pharmacyId, files },
        user,
      );
      router.push(`/applications/${application.id}`);
    } catch (reason) {
      // The filing is real and already has a reference, so name it instead of
      // telling the user to try again — retrying would open a second filing and
      // leave this one unexplained in the queue.
      if (reason instanceof PartialSubmissionError) {
        setPartialFiling({
          id: reason.application.id,
          reference: reason.application.reference,
        });
      }
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "The filing could not be staged. Please try again.",
      );
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeading
        eyebrow="Intake"
        title="New filing"
        description="Stage one or more dispensing files. The file type is checked here; the contents are validated on the server once the bytes are stored."
      />

      <div className="mt-6">
        <PermissionGate action="createApplication">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="title">Filing title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Controlled substance fill log · week of Sep 21"
                  {...form.register("title")}
                />
                {form.formState.errors.title ? (
                  <p className="text-xs text-[var(--danger-text)]">{form.formState.errors.title.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pharmacy">Pharmacy</Label>
                {worker ? (
                  <div className="rounded-stamp border border-hairline/70 bg-accent-soft px-3 py-2.5">
                    <p className="text-sm text-ink">{workerPharmacy?.pharmacy.name ?? "Unassigned"}</p>
                    <p className="font-mono text-[11px] text-muted">
                      {workerPharmacy?.pharmacy.licenseNumber ?? "—"} · locked to your scope
                    </p>
                  </div>
                ) : (
                  <>
                    <Select
                      value={form.watch("pharmacyId")}
                      onValueChange={(v) => form.setValue("pharmacyId", v, { shouldValidate: true })}
                    >
                      <SelectTrigger id="pharmacy" aria-label="Pharmacy">
                        <SelectValue placeholder="Select the filing pharmacy" />
                      </SelectTrigger>
                      <SelectContent>
                        {(pharmacies.data ?? []).map((row) => (
                          <SelectItem key={row.pharmacy.id} value={row.pharmacy.id}>
                            {row.pharmacy.name}
                            <span className="ml-2 font-mono text-[10px] text-muted">
                              {row.association.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {/* Rendered for workers too: the field is read-only for them, so
                    this is the only place a failure of the locked value can
                    surface. */}
                {form.formState.errors.pharmacyId ? (
                  <p className="text-xs text-[var(--danger-text)]">
                    {form.formState.errors.pharmacyId.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>Files</Label>
                <FileDropzone
                  onFilesChange={(files: UploadCandidate[]) =>
                    form.setValue("files", files, { shouldValidate: true })
                  }
                />
                {form.formState.errors.files ? (
                  <p className="text-xs text-[var(--status-rejected-fill)]">{form.formState.errors.files.message}</p>
                ) : null}
              </div>

              {submitError ? (
                <div
                  role="alert"
                  className="border border-[var(--status-rejected)]/50 bg-paper-raised px-3 py-2 text-[13px] text-[var(--danger-text)]"
                >
                  <p>{submitError}</p>
                  {partialFiling ? (
                    <p className="mt-2">
                      Open{" "}
                      <Link
                        href={`/applications/${partialFiling.id}`}
                        className="font-mono underline underline-offset-2"
                      >
                        {partialFiling.reference}
                      </Link>{" "}
                      to see which files are attached. Stage a new filing for anything missing rather
                      than resubmitting this one, so the queue holds one record per submission.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="submit" variant="warm" size="lg" disabled={busy || worker && !workerPharmacy}>
                  {busy ? "Staging filing…" : "Stage filing"}
                </Button>
                <p className="text-xs text-muted">
                  The filing opens as <span className="font-mono">pending</span> and appears in every
                  scoped list immediately.
                </p>
              </div>
            </form>

            <aside aria-label="Staging notes" className="card h-fit px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Staging notes</h2>
              <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-muted">
                <li>
                  Only <span className="font-mono text-[11px] text-ink">.xlsx</span> and{" "}
                  <span className="font-mono text-[11px] text-ink">.csv</span> files are staged.
                  Anything else is held back with a rejection line.
                </li>
                <li>
                  Contents are validated on the server from the stored bytes, then recorded per
                  file in the ledger as passed, advisory, or failed.
                </li>
                <li>
                  Today is {fmtDate(new Date().toISOString())}. Filings keep a full audit trail from
                  this staging event onward.
                </li>
              </ul>
            </aside>
          </div>
        </PermissionGate>
      </div>
    </div>
  );
}