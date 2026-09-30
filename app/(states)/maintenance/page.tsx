import { Wrench } from "lucide-react";
import { SystemStateCard } from "@/components/system-state";

export const metadata = {
  title: "Scheduled maintenance",
  robots: { index: false, follow: false },
};

/**
 * Public, indexable-by-default=false maintenance state.
 *
 * Kept as a page rather than a middleware redirect so that it is a real route
 * with a real status contract: `/status` is the source of truth for whether
 * maintenance is planned, and this page only says that work is in progress.
 */
export default function MaintenancePage() {
  return (
    <SystemStateCard
      icon={Wrench}
      eyebrow="maintenance"
      title="SiroQ is briefly unavailable."
      actions={[
        { href: "/status", label: "Check service status", variant: "default" },
        { href: "/", label: "Home", variant: "ghost" },
      ]}
    >
      <p>
        Planned work is in progress. There is no action needed on your side, and nothing you have
        already submitted has been lost — queued uploads resume once the service is back.
      </p>
      <p className="mt-3">
        If work was not announced on the status page, treat this as an unplanned fault and report
        it through the contact form.
      </p>
    </SystemStateCard>
  );
}
