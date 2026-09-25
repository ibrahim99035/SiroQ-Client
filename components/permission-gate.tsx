"use client";

import { can, type PermissionAction, type PermissionResource } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/store";
import { NotAuthorized } from "@/components/data-states";

/**
 * Central permission gate. Every route-level guard and conditional control
 * goes through `can`/`canFor` — never a direct `user.role` comparison.
 */

/** Renders children only when the current user can perform the action. */
export function VisibleWhen({
  action,
  resource,
  children,
}: {
  action: PermissionAction;
  resource?: PermissionResource;
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  if (!user) return null;
  if (!can(user, action, resource)) return null;
  return <>{children}</>;
}

/** Route-level guard: renders the not-authorized state instead of children. */
export function PermissionGate({
  action,
  resource,
  children,
}: {
  action: PermissionAction;
  resource?: PermissionResource;
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  if (!user) return null;
  if (!can(user, action, resource)) {
    return <NotAuthorized title="This area is governed by a different role." />;
  }
  return <>{children}</>;
}