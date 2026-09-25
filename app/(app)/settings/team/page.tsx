"use client";

import { UserDirectory } from "@/components/user-directory";

export default function SettingsTeamPage() {
  return (
    <UserDirectory
      eyebrow="Settings"
      title="Team"
      description="As an association admin you manage your own tenant's directory: workers are tied to one pharmacy, association admins see the whole network."
      rule="hairline"
    />
  );
}