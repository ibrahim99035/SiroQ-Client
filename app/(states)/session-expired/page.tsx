import { KeyRound } from "lucide-react";
import { SystemStateCard } from "@/components/system-state";

export const metadata = {
  title: "Session expired",
  robots: { index: false, follow: false },
};

/**
 * Reached when a request fails because the session cookie is gone or no longer
 * valid — after the rolling expiry, after a sign-out in another tab, or after a
 * session rotation invalidated the previous cookie.
 *
 * It is explicit that form state is lost. Silently re-authenticating someone
 * behind an expiry is worse than making them sign in again knowingly.
 */
export default function SessionExpiredPage() {
  return (
    <SystemStateCard
      icon={KeyRound}
      eyebrow="session ended"
      title="Your session has ended."
      actions={[
        { href: "/login", label: "Sign in again", variant: "default" },
        { href: "/", label: "Home", variant: "ghost" },
      ]}
    >
      <p>
        You were signed out, most often because the session reached its expiry or was ended in
        another tab. Sign in again to continue.
      </p>
      <p className="mt-3">
        Anything that was only in a form on screen was not submitted and is gone. Records already
        staged into a filing are unaffected.
      </p>
    </SystemStateCard>
  );
}
