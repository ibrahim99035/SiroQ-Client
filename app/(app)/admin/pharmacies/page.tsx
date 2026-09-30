"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, SystemError, TableSkeleton, useRevision } from "@/components/data-states";
import { PharmacyFormDialog } from "@/components/forms/pharmacy-form";
import { PageHeading } from "@/components/page-heading";
import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { useResource } from "@/components/use-resource";
import {
  deletePharmacy,
  fetchAssociationsForUser,
  fetchPharmaciesForUser,
  type PharmacyRow,
} from "@/lib/data";
import { useCurrentUser } from "@/lib/store";
import type { Pharmacy } from "@/lib/types";

export default function AdminPharmaciesPage() {
  const user = useCurrentUser();
  const revision = useRevision();
  const pharmacies = useResource(
    () => fetchPharmaciesForUser(user!),
    [user?.id, revision, "pharmacies"],
  );
  const associations = useResource(
    () => fetchAssociationsForUser(user!),
    [user?.id, revision, "associations"],
  );

  const [editing, setEditing] = React.useState<Pharmacy | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PharmacyRow | null>(null);

  if (!user) return null;

  const state = pharmacies.state === "error" ? "error" : pharmacies.state;
  const error = pharmacies.error ?? associations.error ?? null;

  return (
    <PermissionGate action="managePharmacies">
      <PageHeading
        eyebrow="Administration"
        title="Pharmacies"
        description="Sites that own filings. Deletion is refused while a site still has filings, since it would cascade — review its filings first."
        rule="warm"
      >
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New pharmacy
        </Button>
      </PageHeading>

      <div className="mt-6">
        {state === "error" ? <SystemError error={error!} onRetry={pharmacies.reload} /> : null}
        {state === "loading" ? (
          <TableSkeleton rows={6} />
        ) : pharmacies.state === "ready" ? (
          pharmacies.data!.length === 0 ? (
            <EmptyState
              title="No pharmacies registered yet."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  Register a pharmacy
                </Button>
              }
            >
              Register a site against an association, then assign workers to it through the user
              directory.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
              <table className="ruled-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>License</th>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Association</th>
                    <th className="text-right">Filings</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacies.data!.map((row) => (
                    <tr key={row.pharmacy.id}>
                      <td className="font-mono text-[12px] text-accent">{row.pharmacy.licenseNumber}</td>
                      <td className="font-medium text-ink">{row.pharmacy.name}</td>
                      <td>{row.pharmacy.address}</td>
                      <td>{row.association.name}</td>
                      <td className="text-right font-mono text-[12px]">{row.applicationCount}</td>
                      <td>
                        <EntityStatus status={row.pharmacy.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(row.pharmacy)}
                            aria-label={`Edit ${row.pharmacy.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleting(row)}
                            aria-label={`Delete ${row.pharmacy.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[var(--status-rejected-fill)]" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      <PharmacyFormDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={pharmacies.reload}
        pharmacy={editing}
        associations={associations.data?.map((r) => r.association) ?? []}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.pharmacy.name ?? "pharmacy"}?`}
        description={
          <>
            Deleting is only possible while the pharmacy has no filings. This one still has{" "}
            <strong className="font-mono text-[12px]">{deleting?.applicationCount ?? 0}</strong>
            , so the request will be refused.
          </>
        }
        confirmLabel="Delete pharmacy"
        onConfirm={async () => {
          if (!deleting || !user) return;
          await deletePharmacy(deleting.pharmacy.id, user);
        }}
      />
    </PermissionGate>
  );
}

function EntityStatus({ status }: { status: "active" | "suspended" }) {
  return (
    <span
      className={
        status === "active"
          ? "font-mono text-[10px] uppercase tracking-wider text-[#245c42]"
          : "font-mono text-[10px] uppercase tracking-wider text-[#7a2e26]"
      }
    >
      {status}
    </span>
  );
}