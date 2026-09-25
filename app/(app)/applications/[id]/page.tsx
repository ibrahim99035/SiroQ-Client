"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { AttachReportDialog } from "@/components/attach-report-dialog";
import { EmptyState, NotAuthorized, SystemError, useRevision } from "@/components/data-states";
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
import { useCurrentUser } from "@/lib/store";
import type { ApplicationStatus } from "@/lib/types";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const revision = useRevision();
  const id = String(params.id);

  const { data, state, error, reload } = useResource(
    () => fetchApplicationForUser(user!, id),
    [user?.id, revision, id],
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (!user) return null;

  const isPermission = error instanceof PermissionError;
  const isNotFound = error instanceof DataError && error.code === "not_found";

  const advance = (to: ApplicationStatus) => {
    try {
      updateApplicationStatus(id, to, user);
      reload();
    } catch {
      reload();
    }
  };

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link href="/applications" className="text-[13px] text-accent hover:underline">
          Applications
        </Link>
        <span className="mx-2 text-hairline" aria-hidden="true">/</span>
        <span className="font-mono text-[12px] text-muted">{id}</span>
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
                <div className="flex flex-wrap items-center gap-2 card px-4 py-3" aria-label="Filing controls">
                  <p className="mr-auto text-[13px] text-muted">
                    Triage this filing: advance the review state or attach a report.
                  </p>
                  {data!.application.status === "pending" ? (
                    <Button size="sm" variant="secondary" onClick={() => advance("in_review")}>
                      Move to in review
                    </Button>
                  ) : null}
                  {data!.application.status !== "reported" ? (
                    <Button size="sm" variant="outline" onClick={() => advance("rejected")}>
                      Reject filing
                    </Button>
                  ) : null}
                </div>
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