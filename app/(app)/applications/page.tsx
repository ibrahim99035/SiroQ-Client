"use client";

import Link from "next/link";
import { ApplicationTable } from "@/components/application-table";
import { EmptyState, SystemError, TableSkeleton } from "@/components/data-states";
import { PageHeading } from "@/components/page-heading";
import { VisibleWhen } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { useResource } from "@/components/use-resource";
import { fetchApplicationsForUser } from "@/lib/data";
import { useCurrentUser } from "@/components/session-provider";

export default function ApplicationsPage() {
  const user = useCurrentUser();
  const { data, state, error, reload } = useResource(
    () => fetchApplicationsForUser(user!),
    [user?.id],
  );

  if (!user) return null;

  return (
    <div>
      <PageHeading
        eyebrow="Chain of custody"
        title="Applications"
        description="Every filing in your scope, newest first. Search, filter by status, and sort any column."
        rule="warm"
      >
        <VisibleWhen action="createApplication">
          <Button asChild>
            <Link href="/applications/new">New filing</Link>
          </Button>
        </VisibleWhen>
      </PageHeading>

      <div className="mt-6">
        {state === "error" ? <SystemError error={error!} onRetry={reload} /> : null}
        {state === "loading" ? (
          <TableSkeleton rows={8} />
        ) : state === "ready" ? (
          data!.length === 0 ? (
            <EmptyState
              title="No filings yet."
              action={
                <VisibleWhen action="createApplication">
                  <Button asChild size="sm">
                    <Link href="/applications/new">Upload your first file</Link>
                  </Button>
                </VisibleWhen>
              }
            >
              Nothing has been staged in this scope yet. A filing is created the first time a file is
              staged through the intake form — upload a CSV or workbook and it will appear here.
            </EmptyState>
          ) : (
            <ApplicationTable rows={data!} />
          )
        ) : null}
      </div>
    </div>
  );
}