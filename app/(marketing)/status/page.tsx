import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Status — SiroQ",
  description:
    "Current operational status for SiroQ. What this page does and does not report, and why it is not a substitute for a support channel.",
};

/**
 * Status page.
 *
 * Deliberately does not render uptime percentages or a synthetic incident
 * history. Both would be invented: there is no monitoring service wired to a
 * status database, so any percentage or historical bar chart here would be
 * fabricated data presented as telemetry. The page reports the deployment's
 * actual configuration state and links to the reporting route instead.
 *
 * A status page is the one place where fabricating looks least suspicious and
 * does the most damage.
 */

const COMPONENTS = [
  { name: "Web application", note: "Serves the marketing site and the application interface." },
  { name: "API", note: "Handles authentication, uploads, filings, status transitions and reports." },
  { name: "Database", note: "Managed PostgreSQL. Availability is the provider's, reported here rather than on their status page." },
  { name: "File storage", note: "Object storage for uploaded dispensing files. Read and write on demand." },
  { name: "Transactional email", note: "Invitations, password resets and status notifications. Delivery is best-effort and never blocks the underlying action." },
];

export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="Status"
        title="Operational status."
        lede="This page reports what we can actually observe, which today is less than a status page normally would."
      />

      {/* Honest framing, before any indicator. */}
      <section className="section pb-16">
        <div className="card p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden="true" className="stamp stamp-pending">Monitoring in progress</span>
            <p className="text-[13px] text-muted">
              No automated uptime telemetry is published yet.
            </p>
          </div>
          <p className="mt-5 text-[13px] leading-relaxed text-muted">
            SiroQ does not yet have a monitoring service feeding this page, so we are not going to
            show you an uptime percentage or a history of incidents we did not record. A green banner
            that nobody is watching is worse than an honest gap, because it invites you to trust a
            signal that is not being produced.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            If something is wrong, you will find out from the application failing rather than from
            this page — and the fastest route is the support channel in your agreement.
          </p>
        </div>
      </section>

      <section className="section pb-20">
        <SectionHead
          eyebrow="Components"
          title="What the service depends on."
          lede="Each of these can be unavailable independently of the others, and each has a different blast radius."
        />
        <div className="mt-10 overflow-hidden rounded-card border border-hairline">
          <ul className="divide-y divide-hairline">
            {COMPONENTS.map((component) => (
              <li key={component.name} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-4">
                <span className="min-w-[10rem] text-[13px] font-medium text-ink">{component.name}</span>
                <span className="flex-1 text-[13px] leading-relaxed text-muted">{component.note}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
          During the period this product was in pre-release we observed intermittent connectivity
          failures to the managed database from outside the application entirely. That was an
          infrastructure-provider issue, not an application fault, and it is the reason this page
          names the database as a dependency rather than implying the application controls it.
        </p>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHead eyebrow="Reporting" title="See something wrong? Tell us." />
              <div className="mt-8 prose-doc max-w-none">
                <p>
                  Report an outage through the support channel in your agreement, including the
                  approximate time, the action you took and what you saw. That is genuinely more
                  useful to us than a status page entry, because it arrives with reproduction detail.
                </p>
                <p>
                  Security issues should not go through support. Use the{" "}
                  <a href="/responsible-disclosure" className="underline underline-offset-2">
                    disclosure process
                  </a>{" "}
                  instead.
                </p>
              </div>
            </div>
            <div>
              <SectionHead eyebrow="On the way" title="What this page will become." />
              <ul className="mt-8 space-y-4 text-[13px] leading-relaxed text-muted">
                {[
                  "A health check against each dependency, polled from outside the deployment.",
                  "Published uptime over a rolling window, with the calculation stated.",
                  "An incident log with timestamps, impact and resolution — recorded as things happen, not reconstructed.",
                  "A subscribe option for notifications.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] text-hairline">○</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[12px] leading-relaxed text-muted">
                None of these are dated. A status page without measured data behind it is decoration.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Need a definitive answer now?"
        body="This page is deliberately conservative. For anything time-sensitive, contact us directly rather than reading a banner."
        primary={{ href: "/contact", label: "Contact support" }}
        secondary={{ href: "/faq", label: "Read the FAQ" }}
      />
    </>
  );
}
