"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, SystemError, TableSkeleton, useRevision } from "@/components/data-states";
import { AssociationFormDialog } from "@/components/forms/association-form";
import { PageHeading } from "@/components/page-heading";
import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { useResource } from "@/components/use-resource";
import { deleteAssociation, fetchAssociationsForUser, type AssociationRow } from "@/lib/data";
import { useCurrentUser } from "@/lib/store";
import type { PharmacyAssociation } from "@/lib/types";

export default function AdminAssociationsPage() {
  const user = useCurrentUser();
  const revision = useRevision();
  const { data, state, error, reload } = useResource(
    () => fetchAssociationsForUser(user!),
    [user?.id, revision],
  );

  const [editing, setEditing] = React.useState<PharmacyAssociation | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AssociationRow | null>(null);

  if (!user) return null;

  return (
    <PermissionGate action="manageAssociations">
      <PageHeading
        eyebrow="Administration"
        title="Associations"
        description="Tenants that own pharmacies and filings. Deleting an association cascades to its pharmacies, filings, and reports, and disables its users."
        rule="warm"
      >
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New association
        </Button>
      </PageHeading>

      <div className="mt-6">
        {state === "error" ? <SystemError error={error!} onRetry={reload} /> : null}
        {state === "loading" ? (
          <TableSkeleton rows={4} />
        ) : state === "ready" ? (
          data!.length === 0 ? (
            <EmptyState
              title="No associations in the registry yet."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  Create the first association
                </Button>
              }
            >
              An association is the top tenant. Once created, pharmacies can be attached to it and
              filings start to flow.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
              <table className="ruled-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Region</th>
                    <th>GMP certificate</th>
                    <th className="text-right">Pharmacies</th>
                    <th className="text-right">Filings</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.map((row) => (
                    <tr key={row.association.id}>
                      <td className="font-mono text-[12px] text-accent">{row.association.id}</td>
                      <td className="font-medium text-ink">{row.association.name}</td>
                      <td>{row.association.region}</td>
                      <td className="font-mono text-[12px]">{row.association.gmpCertificateId}</td>
                      <td className="text-right font-mono text-[12px]">{row.pharmacyCount}</td>
                      <td className="text-right font-mono text-[12px]">{row.applicationCount}</td>
                      <td>
                        <EntityStatus status={row.association.status} />
                      </td>
                      <td>
                        <RowActions
                          onEdit={() => setEditing(row.association)}
                          onDelete={() => setDeleting(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      <AssociationFormDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={reload}
        association={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.association.name ?? "association"}?`}
        description={
          <>
            This removes the association, its{" "}
            <strong className="font-mono text-[12px]">{deleting?.pharmacyCount ?? 0}</strong>{" "}
            pharmacies,{" "}
            <strong className="font-mono text-[12px]">{deleting?.applicationCount ?? 0}</strong>{" "}
            attached filings and reports, and disables the users in that tenant. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete association"
        onConfirm={async () => {
          if (!deleting || !user) return;
          deleteAssociation(deleting.association.id, user);
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

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit association">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete association">
        <Trash2 className="h-3.5 w-3.5 text-[var(--status-rejected-fill)]" aria-hidden="true" />
      </Button>
    </div>
  );
}