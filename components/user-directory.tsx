"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, SystemError, TableSkeleton, useRevision } from "@/components/data-states";
import { UserFormDialog } from "@/components/forms/user-form";
import { PageHeading } from "@/components/page-heading";
import { PermissionGate } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { useResource } from "@/components/use-resource";
import {
  fetchAssociationsForUser,
  fetchPharmaciesForUser,
  fetchUsersForUser,
  removeUser,
} from "@/lib/data";
import { useCurrentUser } from "@/lib/store";
import { ROLE_LABELS, type User, type UserStatus } from "@/lib/types";

/**
 * User directory shared by /admin/users (super admin) and /settings/team
 * (association admin, scoped by the data layer).
 */
export function UserDirectory({
  eyebrow,
  title,
  description,
  rule = "warm",
}: {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  rule?: "warm" | "hairline";
}) {
  const actor = useCurrentUser();
  const revision = useRevision();
  const users = useResource(
    () => fetchUsersForUser(actor!),
    [actor?.id, revision, "users"],
  );
  const associations = useResource(
    () => fetchAssociationsForUser(actor!),
    [actor?.id, revision, "associations"],
  );
  const pharmacies = useResource(
    () => fetchPharmaciesForUser(actor!),
    [actor?.id, revision, "pharmacies"],
  );

  const [editing, setEditing] = React.useState<User | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<User | null>(null);

  if (!actor) return null;

  const assocName = (id?: string) =>
    associations.data?.find((a) => a.association.id === id)?.association.name ?? "—";
  const pharmacyName = (id?: string) =>
    pharmacies.data?.find((p) => p.pharmacy.id === id)?.pharmacy.name ?? "—";

  const state =
    users.state === "error" || associations.state === "error" || pharmacies.state === "error"
      ? "error"
      : users.state;
  const error = users.error ?? associations.error ?? pharmacies.error ?? null;

  return (
    <PermissionGate action="manageUsers">
      <PageHeading eyebrow={eyebrow} title={title} description={description} rule={rule}>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Invite user
        </Button>
      </PageHeading>

      <div className="mt-6">
        {state === "error" ? <SystemError error={error!} onRetry={users.reload} /> : null}
        {state === "loading" ? (
          <TableSkeleton rows={8} />
        ) : users.state === "ready" ? (
          users.data!.length === 0 ? (
            <EmptyState
              title="No users in this directory yet."
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  Invite the first user
                </Button>
              }
            >
              Invite a pharmacy worker or an association admin to bring the directory to life.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
              <table className="ruled-table min-w-[840px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Association</th>
                    <th>Pharmacy</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data!.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-ink">
                        {u.name}
                        {u.id === actor.id ? (
                          <span className="ml-2 font-mono text-[10px] text-muted">you</span>
                        ) : null}
                      </td>
                      <td className="font-mono text-[12px]">{u.email}</td>
                      <td>{ROLE_LABELS[u.role]}</td>
                      <td>{assocName(u.associationId)}</td>
                      <td>{pharmacyName(u.pharmacyId)}</td>
                      <td>
                        <UserStatusChip status={u.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(u)}
                            aria-label={`Edit ${u.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          {u.id !== actor.id ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleting(u)}
                              aria-label={`Remove ${u.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--status-rejected-fill)]" aria-hidden="true" />
                            </Button>
                          ) : null}
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

      <UserFormDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={users.reload}
        user={editing}
        associations={associations.data?.map((r) => r.association) ?? []}
        pharmacies={pharmacies.data?.map((r) => r.pharmacy) ?? []}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Remove ${deleting?.name ?? "user"}?`}
        description={
          <>
            The identity is removed from the directory and can no longer sign in. Filings keep their
            audit trail — the submitter name is retained on the records the person filed.
          </>
        }
        confirmLabel="Remove user"
        onConfirm={async () => {
          if (!deleting || !actor) return;
          // A self-delete is refused by the server; ConfirmDialog shows why.
          await removeUser(deleting.id, actor);
        }}
      />
    </PermissionGate>
  );
}

function UserStatusChip({ status }: { status: UserStatus }) {
  const tone =
    status === "active"
      ? "text-[#245c42]"
      : status === "invited"
        ? "text-[#7a5c08]"
        : "text-muted";
  return (
    <span className={`font-mono text-[10px] uppercase tracking-wider ${tone}`}>{status}</span>
  );
}