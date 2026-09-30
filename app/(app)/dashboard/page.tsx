"use client";

import Link from "next/link";
import * as React from "react";
import { ApplicationTable } from "@/components/application-table";
import {
  EmptyState,
  StatStripSkeleton,
  SystemError,
  TableSkeleton,
  useRevision,
} from "@/components/data-states";
import { PageHeading } from "@/components/page-heading";
import { StatModule, StatStrip } from "@/components/stat-module";
import { VisibleWhen } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { useResource } from "@/components/use-resource";
import {
  fetchApplicationsForUser,
  fetchDashboardForUser,
  fetchPharmaciesForUser,
} from "@/lib/data";
import { can, dataScope } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { fmtMinutes } from "@/lib/utils";

export default function DashboardPage() {
  const user = useCurrentUser();
  const revision = useRevision();

  const stats = useResource(
    () => fetchDashboardForUser(user!),
    [user?.id, revision, "stats"],
  );
  const rows = useResource(
    () => fetchApplicationsForUser(user!),
    [user?.id, revision],
  );
  const pharmacies = useResource(
    () => fetchPharmaciesForUser(user!),
    [user?.id, revision, "pharmacies"],
  );

  if (!user) return null;

  const scope = dataScope(user);
  const mutating = stats.state === "loading" || rows.state === "loading" || pharmacies.state === "loading";

  return (
    <div>
      <PageHeading
        eyebrow={`Signed in as ${user.name} · ${ROLE_LABELS[user.role]}`}
        title="Dashboard"
        description={
          stats.data
            ? `Scope: ${stats.data.scopeLabel}. These figures are computed live from the in-memory filing set for your role.`
            : undefined
        }
      >
        <VisibleWhen action="createApplication">
          <Button asChild>
            <Link href="/applications/new">New filing</Link>
          </Button>
        </VisibleWhen>
      </PageHeading>

      {stats.state === "error" ? <SystemError error={stats.error!} onRetry={stats.reload} /> : null}

      {mutating ? (
        <div className="mt-6 space-y-6">
          <StatStripSkeleton />
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          <StatStrip aria-label="Workload summary">
            <StatModule
              label="Total filings"
              value={stats.data?.total.toLocaleString("en-US") ?? "0"}
              trend={stats.data?.weekly.map((w) => w.submitted)}
              sub="staged per week, 8-week window"
              featured
            />
            <StatModule
              label="Pending"
              value={stats.data?.pending.toLocaleString("en-US") ?? "0"}
              trend={stats.data?.weeklyPending.map((w) => w.submitted)}
              sub="awaiting triage"
            />
            <StatModule
              label="Avg time to report"
              value={stats.data?.avgTimeToReport != null ? fmtMinutes(stats.data.avgTimeToReport) : "—"}
              sub="from staging to stamped report"
            />
            <StatModule
              label="Rejection rate"
              value={`${((stats.data?.rejectionRate ?? 0) * 100).toFixed(1)}%`}
              trend={stats.data?.weeklyRejected.map((w) => w.submitted)}
              sub="of filings rejected"
            />
          </StatStrip>

          {scope === "all" ? <AssociatesPanel user={user} /> : null}

          {scope === "association" ? (
            <PharmaciesPanel pharmacyCount={pharmacies.data?.length ?? 0} />
          ) : null}

          {scope === "pharmacy" ? (
            <PharmacyCard
              name={pharmacies.data?.[0]?.pharmacy.name}
              license={pharmacies.data?.[0]?.pharmacy.licenseNumber}
              address={pharmacies.data?.[0]?.pharmacy.address}
              association={pharmacies.data?.[0]?.association.name}
            />
          ) : null}

          <section aria-labelledby="recent-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-title" className="text-base font-semibold text-ink">
                {scope === "pharmacy" ? "Your filings" : "Recent filings"}
              </h2>
              <Link href="/applications" className="text-[13px] text-accent hover:underline">
                Open the filings ledger
              </Link>
            </div>

            {rows.state === "error" ? <SystemError error={rows.error!} onRetry={rows.reload} /> : null}
            {rows.state === "ready" && rows.data!.length === 0 ? (
              <EmptyState
                title={
                  scope === "pharmacy"
                    ? "No filings yet for your pharmacy"
                    : "Nothing staged in this scope yet"
                }
                action={
                  <VisibleWhen action="createApplication">
                    <Button asChild size="sm">
                      <Link href="/applications/new">Stage your first filing</Link>
                    </Button>
                  </VisibleWhen>
                }
              >
                {scope === "pharmacy"
                  ? "Your chain of custody starts empty. Stage a .xlsx or .csv dispensing file to begin a filing."
                  : "A filing appears here as soon as a pharmacy worker stages files through the intake form."}
              </EmptyState>
            ) : rows.state === "ready" ? (
              <ApplicationTable rows={rows.data!} />
            ) : (
              <TableSkeleton rows={5} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AssociatesPanel({ user }: { user: NonNullable<ReturnType<typeof useCurrentUser>> }) {
  const canManage = can(user, "manageAssociations");
  return (
    <section className="card px-5 py-5" aria-label="Governance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Governance and administration</h2>
          <p className="mt-1 text-[13px] text-muted">
            {canManage
              ? "Manage associations, pharmacies, and the user directory from the admin console."
              : "This review is read-only. Contact a super admin to run a report on any filing."}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/associations">Associations</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/pharmacies">Pharmacies</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/users">Users</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PharmaciesPanel({ pharmacyCount }: { pharmacyCount: number }) {
  return (
    <section className="card px-5 py-5" aria-label="Pharmacies in scope">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Pharmacies in your association</h2>
          <p className="mt-1 text-[13px] text-muted">
            {`${pharmacyCount} pharmacies currently fall inside your association's scope.`}
          </p>
        </div>
        <span className="font-mono text-sm text-ink">{String(pharmacyCount).padStart(2, "0")}</span>
      </div>
    </section>
  );
}

function PharmacyCard({
  name,
  license,
  address,
  association,
}: {
  name?: string;
  license?: string;
  address?: string;
  association?: string;
}) {
  if (!name) {
    return null;
  }
  return (
    <section className="card px-5 py-5" aria-label="Your pharmacy">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        <div>
          <dt className="req-field-label">Pharmacy</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{name}</dd>
        </div>
        <div>
          <dt className="req-field-label">License</dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">{license ?? "—"}</dd>
        </div>
        <div>
          <dt className="req-field-label">Address</dt>
          <dd className="mt-1 text-[13px] text-ink">{address ?? "—"}</dd>
        </div>
        <div>
          <dt className="req-field-label">Association</dt>
          <dd className="mt-1 text-[13px] text-ink">{association ?? "—"}</dd>
        </div>
      </dl>
    </section>
  );
}