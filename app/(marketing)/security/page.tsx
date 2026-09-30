import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Security — SiroQ",
  description:
    "How SiroQ protects dispensing records: session design, tenant isolation enforced per request, server-written audit events, and the controls that are not implemented yet.",
};

/**
 * Security posture.
 *
 * Written as an inventory rather than a claim sheet, and the "not implemented"
 * section is load-bearing. Anyone running a vendor review will find the gaps
 * anyway; naming them first is the difference between a security page and a
 * brochure.
 */

const IN_PLACE = [
  {
    title: "Session design",
    body: "Sessions are opaque random identifiers stored hashed server-side. Nothing about the user is encoded in the cookie, so there is no token to decode or forge. Cookies are httpOnly and SameSite, and logout revokes the record rather than clearing the cookie alone.",
  },
  {
    title: "Password handling",
    body: "Passwords are hashed with bcrypt. Comparison is constant-time. Login responses are deliberately identical for an unknown address and a wrong password, so the endpoint cannot be used to enumerate accounts.",
  },
  {
    title: "Tenant isolation per request",
    body: "Scope comes from the session on every request; no route accepts an association, pharmacy or role as a client parameter. A record outside the caller's scope returns not-found rather than forbidden, so the endpoint cannot be used to probe other customers' identifiers.",
  },
  {
    title: "Server-written audit trail",
    body: "Status events are written inside the transaction that performs the transition, recording the actor, previous state, new state and time. A failed transition leaves no gap, and delivered reports cannot be overwritten.",
  },
  {
    title: "Invite-only accounts",
    body: "There is no path to a usable account without an administrator's single-use invitation. A self-registered address creates an invited row with no tenant, and a non-active user is denied every action.",
  },
  {
    title: "Upload handling",
    body: "Bytes go to storage via short-lived presigned URLs, staged unattached and only bound to a filing after the server has hashed and inspected them. Size and extension limits are enforced, file contents are sniffed rather than trusted from the extension, and keys are checked for traversal.",
  },
  {
    title: "Document access",
    body: "Raw source documents are streamed through an authorised endpoint. There is no public or guessable URL for a stored file, and access requires the read permission for that filing.",
  },
  {
    title: "Transport and storage encryption",
    body: "TLS in transit to the database and object storage, with encryption at rest provided by the infrastructure vendor. There is no application-layer envelope encryption or customer-managed key support.",
  },
];

const NOT_IN_PLACE = [
  ["No SOC 2 Type II or ISO 27001", "We are not audited. We do not have a report to send you, and we will not imply otherwise."],
  ["No HIPAA certification", "SiroQ does not claim to be a covered-entity business associate under a signed BAA."],
  ["No rate limiting on application routes", "Authentication and upload routes have no distributed rate limit. A counter on the public contact form exists but is per-process."],
  ["No application-layer encryption", "No envelope encryption, no customer-managed keys, no per-tenant key separation."],
  ["No single sign-on", "Password and session only. No SAML or OIDC."],
  ["No security monitoring service", "There is no SIEM integration, anomaly detection on auth events, or alerting beyond server logs."],
  ["No formal incident response plan", "No published process, no notification commitment, no post-mortem template."],
  ["No external penetration test", "None has been carried out. This is the largest gap on the list and we would rather name it than let it be found later."],
];

export default function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="What protects your dispensing records, and what does not."
        lede="SiroQ is pre-certification and pre-audit. This page is an inventory of controls that exist in the code, followed by an inventory of ones that do not. Both are current."
      />

      <section className="section pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          {IN_PLACE.map((control) => (
            <div key={control.title} className="card p-6">
              <h2 className="flex items-start gap-2.5 text-[14px] font-medium text-ink">
                <span aria-hidden="true" className="mt-0.5 text-accent">✓</span>
                {control.title}
              </h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{control.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The section that makes the first one credible. */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="Gaps"
            title="Not implemented. As of now."
            lede="If you are running a vendor assessment, you will check these anyway. Finding them here first is more useful than a discovery call."
          />
          <div className="mt-12 overflow-hidden rounded-card border border-hairline bg-paper-raised">
            <ul className="divide-y divide-hairline">
              {NOT_IN_PLACE.map(([item, detail]) => (
                <li key={item} className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-4">
                  <span className="text-[13px] font-medium text-ink">{item}</span>
                  <span className="text-[13px] text-muted">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 max-w-2xl text-[13px] leading-relaxed text-muted">
            Several of these are ordinary for a pre-launch product and none of them are hidden from
            you. What we would ask in return is proportion: we are a small team with an audited-free
            posture, and if your requirement is a signed audit report, we are not the right vendor
            yet. That is a better conversation than a discovery call three weeks from now.
          </p>
        </div>
      </section>

      <section className="section py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead
              eyebrow="Verification"
              title="Check it yourself."
              lede="Most of the claims above are testable in about ten minutes, using two accounts."
            />
            <div className="mt-8 prose-doc max-w-none">
              <ol>
                <li>Create an association and a pharmacy worker account.</li>
                <li>Open a filing from the worker account and note its reference.</li>
                <li>From an association admin account in a second association, request that same filing id.</li>
                <li>The response is not-found, not forbidden, and no data about the other tenant is returned.</li>
                <li>Move the filing through its states and compare the timeline to what the status endpoints recorded.</li>
              </ol>
              <p>
                Steps three and four are the ones worth doing. A vendor that scopes its list endpoint
                but not its detail endpoint has not actually isolated tenants, and this is a fast way
                to find out.
              </p>
            </div>
          </div>

          <div>
            <SectionHead eyebrow="Related" title="The adjacent pages." />
            <div className="mt-8 space-y-3">
              {[
                { href: "/compliance", title: "Compliance", body: "Controls mapped to obligations, and where they stop." },
                { href: "/subprocessors", title: "Subprocessors", body: "Every processor touching your data, in one list." },
                { href: "/dpa", title: "Data processing addendum", body: "What we commit to in writing." },
                { href: "/responsible-disclosure", title: "Responsible disclosure", body: "How to report a vulnerability." },
                { href: "/docs#authorization", title: "Authorization spec", body: "The permission module's public contract." },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="card block p-5 transition-colors hover:border-accent"
                >
                  <p className="text-[13px] font-medium text-ink">{link.title}</p>
                  <p className="mt-1 text-[12px] text-muted">{link.body}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Want the details behind any of this?"
        body="Security reviews get the module, not the summary. Bring your questionnaire and we will answer it line by line, including the rows we cannot tick."
        primary={{ href: "/contact", label: "Request a security review" }}
        secondary={{ href: "/compliance", label: "Compliance posture" }}
      />
    </>
  );
}
