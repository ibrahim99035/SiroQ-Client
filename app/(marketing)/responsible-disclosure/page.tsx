import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Responsible Disclosure — SiroQ",
  description:
    "How to report a security vulnerability in SiroQ, what to expect after you report one, and what we ask of reporters.",
};

/**
 * Responsible disclosure.
 *
 * The one thing this page cannot do is publish a contact address for security
 * reports, because there is no verified mailbox configured in the deployment. It
 * says so plainly and routes reporters to the channel a human actually monitors,
 * rather than publishing a plausible-looking address that bounces.
 */

const IN_SCOPE = [
  "Cross-tenant data access — any route returning data belonging to another association or pharmacy",
  "Authentication or session weaknesses — session fixation, session not invalidated on deactivation or password change",
  "Authorisation gaps — a role obtaining an action the permission module refuses",
  "Upload handling — path traversal, type confusion, or a file served without the read permission",
  "Injection — SQL, command, or template injection reachable from user input",
];

const OUT_OF_SCOPE = [
  "Findings that require an already-compromised account, or physical access to a device",
  "Denial of service through volume alone. Note that application routes have no rate limiting today; we know, and it is documented as a gap rather than treated as a reportable finding.",
  "Missing security headers with no demonstrated impact",
  "Self-XSS requiring the reporter to trick another user",
  "Scanning results naming outdated dependency versions with no reachable code path",
  "Social engineering of our staff",
];

export default function ResponsibleDisclosurePage() {
  return (
    <>
      <PageHeader
        eyebrow="Responsible disclosure"
        title="If you find a hole, we would rather hear it from you."
        lede="Please report security issues privately rather than disclosing them publicly before we have had a chance to fix them."
      />

      {/* The honest bit about not having a security mailbox. */}
      <section className="section pb-16">
        <div className="well px-6 py-5">
          <p className="text-[13px] font-medium text-ink">How to reach us</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            We have not yet configured a dedicated security mailbox on this deployment, so rather
            than publish an address that would bounce, use the contact form and mark it clearly as a
            security report. We read those ourselves. If you would prefer not to use a form for this,
            reply to any email you have already received from us and it will reach a person.
          </p>
          <a
            href="/contact"
            className="mt-4 inline-block text-[13px] font-medium text-accent underline underline-offset-2"
          >
            Report a vulnerability →
          </a>
        </div>
      </section>

      <section className="section pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="card p-7">
            <h2 className="text-[15px] font-medium text-ink">What we ask</h2>
            <ul className="mt-5 space-y-3 text-[13px] leading-relaxed text-muted">
              {[
                "Give us reasonable time to fix the issue before disclosing publicly. We aim to acknowledge within three working days.",
                "Test only against deployments you are authorised to use, and avoid actions that affect other users' data.",
                "Do not exfiltrate, modify, or delete real customer data. A proof of concept with synthetic data is entirely sufficient.",
                "Tell us what you found and how to reproduce it. Reproduction detail is the single most useful thing you can send.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[7px] text-accent">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-7">
            <h2 className="text-[15px] font-medium text-ink">What you get</h2>
            <ul className="mt-5 space-y-3 text-[13px] leading-relaxed text-muted">
              {[
                "An acknowledgement, and then a decision on whether we agree it is a genuine issue.",
                "A fix or a mitigation. If we cannot fix an issue we will say so rather than leave you guessing.",
                "An honest assessment rather than a delay: if a report is out of scope we will explain why.",
                "Credit in the release notes if you want it. We will not name you anywhere without explicit permission.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[7px] text-accent">→</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-hairline pt-4 text-[12px] leading-relaxed text-muted">
              We do not currently operate a bug bounty or a formal safe-harbour programme. We honour
              good-faith research that follows the requests above, but that is a practice rather than
              a legal instrument, and we would rather be precise about the difference.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="Scope"
            title="What counts as in scope."
            lede="The boundaries below are about what we can realistically fix, not about deflecting reports."
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <div className="card p-7">
              <p className="req-field-label">In scope</p>
              <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted">
                {IN_SCOPE.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] text-accent">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-7">
              <p className="req-field-label">Out of scope</p>
              <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted">
                {OUT_OF_SCOPE.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] text-hairline">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-8 max-w-2xl text-[13px] leading-relaxed text-muted">
            Disagreement about scope is not a reason to withhold a report. Send it anyway. If we
            disagree we will say so directly, and if we are wrong you can publish.
          </p>
        </div>
      </section>

      <CtaBand
        title="Reporting something that is not a vulnerability?"
        body="Bugs in the application, confusing interfaces and bad error messages are all worth reporting — they go to the same place, minus the embargo."
        primary={{ href: "/contact", label: "Send a report" }}
        secondary={{ href: "/security", label: "Read the security posture" }}
      />
    </>
  );
}
