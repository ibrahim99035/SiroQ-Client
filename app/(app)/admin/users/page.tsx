"use client";

import { PermissionGate } from "@/components/permission-gate";
import { UserDirectory } from "@/components/user-directory";

export default function AdminUsersPage() {
  return (
    <PermissionGate action="manageUsers">
      <UserDirectory
        eyebrow="Administration"
        title="User directory"
        description="All identities across the platform. Invite, scope, and remove users; disabling turns their access off immediately."
      />
    </PermissionGate>
  );
}