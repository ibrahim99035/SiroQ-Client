import { CircleSlash2 } from "lucide-react";
import { SystemStateCard } from "@/components/system-state";

export const metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

/**
 * Landed on by `PermissionGate` in the cases where it is a navigation target
 * rather than an inline panel — for example a link that has left the sidebar
 * because the current role no longer includes it.
 *
 * The wording is careful: SiroQ answers a record outside the caller's scope as
 * "not found" in API responses, so this page describes a *route* the role does
 * not cover, not a record that is being withheld.
 */
export default function AccessDeniedPage() {
  return (
    <SystemStateCard
      icon={CircleSlash2}
      eyebrow="access denied"
      title="This area is outside your role."
      actions={[
        { href: "/dashboard", label: "Back to dashboard", variant: "default" },
        { href: "/contact", label: "Request access", variant: "outline" },
      ]}
    >
      <p>
        Your account is signed in, but its role does not include this section. Nothing is wrong with
        your account and no data has been changed.
      </p>
      <p className="mt-3">
        Access follows your role, and roles are assigned per pharmacy or association. If you need
        this section, an administrator has to change your access — a request through the contact
        form is the way to ask.
      </p>
    </SystemStateCard>
  );
}
