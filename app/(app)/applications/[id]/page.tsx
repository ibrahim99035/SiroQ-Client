"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { AttachReportDialog } from "@/components/attach-report-dialog";
import { EmptyState, NotAuthorized, SystemError } from "@/components/data-states";
import { FileLedger } from "@/components/file-ledger";
import { PageHeading } from "@/components/page-heading";
import { VisibleWhen } from "@/components/permission-gate";
import { ReportPanel } from "@/components/report-panel";
import { RequisitionHeader } from "@/components/requisition-header";
import { StatusTimeline } from "@/components/status-timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResource } from "@/components/use-resource";
import { DataError, fetchApplicationForUser, updateApplicationStatus } from "@/lib/data";
import { PermissionError } from "@/lib/permissions";
import { useCurrentUser } from "@/components/session-provider";
import type { ApplicationStatus } from "@/lib/types";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const id = String(params.id);

  const { data, state, error, reload } = useResource(
    () => fetchApplicationForUser(user!, id),
    [user?.id, id],
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [advancing, setAdvancing] = React.useState(false);
  const [advanceError, setAdvanceError] = React.useState<string | null>(null);

  if (!user) return null;

  const isPermission = error instanceof PermissionError;
  const isNotFound = error instanceof DataError && error.code === "not_found";

  // `data` is null while the resource loads and on the error branches, and
  // this component only early-returns for a missing user, so this has to
  // tolerate a null resource. The bar that uses it is only rendered once
  // `data!` is known to be present.
  const status = data?.application.status;
  const isTerminal = status === "reported" || status === "rejected";

  const advance = async (to: ApplicationStatus) => {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await updateApplicationStatus(id, to, user);
      await reload();
    } catch (reason) {
      // Surfaced, not swallowed. The old mock threw synchronously and the
      // `catch { reload() }` below it turned every refusal into a silent no-op,
      // so a user who could not move a filing was told nothing at all.
      setAdvanceError(
        reason instanceof Error ? reason.message : "That status change was refused.",
      );
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link href="/applications" className="text-[13px] text-accent hover:underline">
          Applications
        </Link>
        <span className="mx-2 text-hairline" aria-hidden="true">/</span>
        {/* The filing reference, not the route id. `id` is a UUID, which is
            database identity rather than anything a user recognises; the mock
            layer used the reference as the key, so this slot used to read
            "AP-2026-2601" and would otherwise have silently become a UUID. */}
        <span className="font-mono text-[12px] text-muted">
          {data?.application.reference ?? id}
        </span>
      </nav>

      {state === "loading" ? (
        <DetailSkeleton />
      ) : state === "error" ? (
        <div className="mt-6">
          {isPermission ? <NotAuthorized detail={error.message} /> : null}
          {isNotFound ? (
            <EmptyState
              title="No filing matches that reference."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link href="/applications">Return to the filings ledger</Link>
                </Button>
              }
            >
              The reference <span className="font-mono text-[12px] text-ink">{id}</span> is not part
              of the current dataset, or it was removed by a governance action.
            </EmptyState>
          ) : null}
          {!isPermission && !isNotFound ? <SystemError error={error!} onRetry={reload} /> : null}
        </div>
      ) : (
        <div>
          <PageHeading
            eyebrow={data!.pharmacy.name}
            title={data!.application.title}
            rule="hairline"
          >
            <VisibleWhen action="attachReport">
              {data!.application.status !== "reported" ? (
                <Button variant="warm" onClick={() => setDialogOpen(true)}>
                  Attach report
                </Button>
              ) : null}
            </VisibleWhen>
          </PageHeading>

          <div className="mt-5">
            <RequisitionHeader row={data!} />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-8">
              {/* Triage controls for reviewers */}
              <VisibleWhen action="updateApplicationStatus">
                {/* `reported` and `rejected` are terminal. Rendering the triage
                    bar on them was wrong twice over: the prompt still told the
                    reviewer to advance the filing, and the button set collapsed
                    to nothing on `reported` (a lone instruction with no action)
                    while `rejected` kept offering "Reject filing", which the API
                    answers with 409 because the status is already that. An
                    action that can only fail should not be on the screen. */}
                {isTerminal ? (
                  <div className="flex flex-wrap items-center gap-2 card px-4 py-3" aria-label="Filing controls">
                    <p className="text-[13px] text-muted">
                      {status === "reported"
                        ? "This filing is reported and closed to further changes. The attached report is the deliverable."
                        : "This filing was rejected and is closed to further changes."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 card px-4 py-3" aria-label="Filing controls">
                    <p className="mr-auto text-[13px] text-muted">
                      Triage this filing: advance the review state or attach a report.
                    </p>
                    {status === "pending" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={advancing}
                        onClick={() => void advance("in_review")}
                      >
                        Move to in review
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={advancing}
                      onClick={() => void advance("rejected")}
                    >
                      Reject filing
                    </Button>
                  </div>
                )}
                {advanceError ? (
                  <p
                    role="alert"
                    className="mt-2 border border-[var(--status-rejected)]/50 px-3 py-2 text-[13px] text-[#7a2e26]"
                  >
                    {advanceError}
                  </p>
                ) : null}
              </VisibleWhen>

              <section aria-labelledby="ledger-title">
                <h2 id="ledger-title" className="mb-3 text-base font-semibold text-ink">
                  File ledger
                </h2>
                <FileLedger files={data!.application.files} />
              </section>

              {data!.report ? (
                <ReportPanel report={data!.report} />
              ) : (
                <section className="card px-5 py-4">
                  <p className="text-sm text-muted">
                    No report is attached to this filing yet. A super admin generates one from the
                    ledger metadata; the filing flips to <span className="font-mono text-[11px] text-ink">reported</span>{" "}
                    and the stamp updates everywhere.
                  </p>
                </section>
              )}
            </div>

            <aside aria-label="Status" className="h-fit lg:sticky lg:top-20">
              <h2 className="mb-3 text-base font-semibold text-ink">Chain of custody</h2>
              <StatusTimeline application={data!.application} />
            </aside>
          </div>
        </div>
      )}

      <AttachReportDialog
        applicationId={id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCompleted={reload}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading filing">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="card mt-5 p-5">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}