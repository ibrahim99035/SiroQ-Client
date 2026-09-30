import Link from "next/link";
import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Compliance — SiroQ",
  description:
    "SiroQ's compliance posture: which controls exist today, which are in progress, which are not built, and why no certification is claimed.",
};

/**
 * Compliance posture.
 *
 * The distinction the page turns on is between a control that exists in the
 * code, one that is planned, and one that does not exist. Presenting the third
 * category as the first is the most common way a compliance page becomes
 * misleading, so the third category gets its own section.
 */

const IMPLEMENTED = [
  ["Access control", "Four documented roles, with a single permission module consulted by every route. A non-active user is denied everything."],
  ["Tenant isolation", "Scope derived from the session on every request. Cross-tenant reads return not-found rather than forbidden."],
  ["Audit trail", "Server-written status events, committed in the same transaction as the change they describe."],
  ["Record integrity", "SHA-256 per stored file. Delivered reports cannot be overwritten; correction requires a reopen, which is audited."],
  ["Account lifecycle", "Invite-only creation, single-use invitation tokens, and immediate session revocation on deactivation."],
  ["Data minimisation in responses", "Unhandled errors are logged server-side and replaced with a generic 500. Permission refusals do not disclose whether a record exists elsewhere."],
];

const IN_PROGRESS = [
  ["Distributed rate limiting", "Needed before the application handles untrusted traffic at volume. Today the only counter is in-process on the public contact form."],
  ["Formal incident response", "Process, notification path and post-mortem template are being written. No commitment is published until they are."],
  ["Retention controls", "Retention is agreed per contract rather than enforced by the product. Scheduled deletion does not yet exist."],
  ["Export tooling", "Audit-trail export is an Enterprise commitment; the bulk structured export is not built."],
];

const NOT_BUILT = [
  ["Certification", "No SOC 2 Type I or II. No ISO 27001. No HIPAA certification or signed business associate agreement."],
  ["Penetration testing", "No external test has been performed."],
  ["Access reviews", "No periodic review of who holds which role, and no automated access recertification."],
  ["Vulnerability management", "Dependency scanning runs in CI. There is no formal vulnerability SLA or patch commitment."],
  ["Backup verification", "Point-in-time recovery is a feature of the database provider. We have not independently verified restore procedures."],
  ["Encryption keys", "No customer-managed keys or per-tenant key separation."],
  ["Data residency", "Available on Enterprise by agreement, not as a self-service product feature."],
];

export default function CompliancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Three categories, and we keep them separate."
        lede="What is implemented in the code today. What is genuinely in progress. And what does not exist. Collapsing these into one list is how compliance pages mislead, so this page does not."
      />

      <section className="section pb-20">
        <div className="well px-6 py-5">
          <p className="text-[13px] font-medium text-ink">No certification is claimed</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            SiroQ is not SOC 2 certified, not ISO 27001 certified, and not a HIPAA-covered service.
            We hold no audit report to send you and no BAA to sign. If a certification is a hard
            requirement, we are not a suitable vendor — and you should establish that now rather than
            after a pilot.
          </p>
        </div>
      </section>

      {/* Implemented. */}
      <section className="section pb-20">
        <SectionHead
          eyebrow="Implemented"
          title="In the code today."
          lede="These are enforced, not documented intentions. Each maps to a module you can ask to see."
        />
        <div className="mt-10 overflow-hidden rounded-card border border-hairline">
          <ul className="divide-y divide-hairline">
            {IMPLEMENTED.map(([area, detail]) => (
              <li key={area} className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-4">
                <span className="min-w-[9rem] text-[13px] font-medium text-ink">{area}</span>
                <span className="flex-1 text-[13px] leading-relaxed text-muted">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* In progress. */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="In progress"
            title="Being built, with no date attached."
            lede="Deliberately undated. A roadmap without dates is a wish, and publishing one as a commitment is how a vendor page loses its credibility."
          />
          <div className="mt-10 overflow-hidden rounded-card border border-hairline bg-paper-raised">
            <ul className="divide-y divide-hairline">
              {IN_PROGRESS.map(([area, detail]) => (
                <li key={area} className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-4">
                  <span className="min-w-[9rem] text-[13px] font-medium text-ink">{area}</span>
                  <span className="flex-1 text-[13px] leading-relaxed text-muted">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Not built. */}
      <section className="section py-20">
        <SectionHead
          eyebrow="Not built"
          title="Does not exist. Do not tick these off."
          lede="If your questionnaire has a row for one of these, the honest answer is no."
        />
        <div className="mt-10 overflow-hidden rounded-card border border-hairline">
          <ul className="divide-y divide-hairline">
            {NOT_BUILT.map(([area, detail]) => (
              <li key={area} className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-4">
                <span className="min-w-[9rem] text-[13px] font-medium text-ink">{area}</span>
                <span className="flex-1 text-[13px] leading-relaxed text-muted">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHead
                eyebrow="Obligations"
                title="SiroQ is a tool, not a compliance programme."
                lede="Producing a better record of a review does not make an organisation compliant. It makes the record defensible, which is a smaller and more honest claim."
              />
              <div className="mt-8 prose-doc max-w-none">
                <p>
                  Most frameworks impose obligations on the entity handling the data — retention
                  schedules, access reviews, training, breach notification. SiroQ supports some of
                  them and substitutes for none. If you are mapping controls, treat this platform as
                  evidence infrastructure: it makes the handling of dispensing records demonstrable,
                  and the obligations remain yours.
                </p>
                <p>
                  We are happy to be described accurately in your documentation. If a control is
                  partly satisfied by SiroQ and partly by your own process, we would rather say so
                  than let the gap hide behind our logo.
                </p>
              </div>
            </div>

            <div>
              <SectionHead eyebrow="Procurement" title="Where to go next." />
              <div className="mt-8 space-y-3">
                {[
                  { href: "/dpa", title: "Data processing addendum", body: "What we commit to contractually." },
                  { href: "/subprocessors", title: "Subprocessors", body: "Every processor, with the data each touches." },
                  { href: "/security", title: "Security controls", body: "The technical inventory, including gaps." },
                  { href: "/responsible-disclosure", title: "Responsible disclosure", body: "How to report a vulnerability." },
                  { href: "/docs#not-implemented", title: "Technical gaps", body: "The engineering-side list." },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="card block p-5 transition-colors hover:border-accent"
                  >
                    <p className="text-[13px] font-medium text-ink">{link.title}</p>
                    <p className="mt-1 text-[12px] text-muted">{link.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Send us your questionnaire."
        body="We will fill it in honestly, including the rows that come back no. A partially completed questionnaire from us is more useful than a complete one you find out is wrong."
        primary={{ href: "/contact", label: "Start a review" }}
        secondary={{ href: "/dpa", label: "Read the DPA" }}
      />
    </>
  );
}
