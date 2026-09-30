import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Subprocessors — SiroQ",
  description:
    "Every third party that processes SiroQ customer data, what each one touches, and why it is in the list.",
};

/**
 * Subprocessor list.
 *
 * Transcribed from the deployment configuration rather than from memory: the
 * database connection, the storage driver, the SMTP relay and the optional
 * analysis service. A subprocessor page that is out of date is worse than none,
 * because it is evidence in a vendor review.
 */

const PROCESSORS = [
  {
    name: "Managed PostgreSQL provider",
    role: "Primary database",
    data: "Tenants, users, pharmacies, filings, file metadata, status events, report records and session records.",
    why: "Application state. There is no self-hosted database option, so a managed provider is required to run the product.",
    when: "Every request that reads or writes application state.",
  },
  {
    name: "Object storage provider",
    role: "File storage",
    data: "The bytes of uploaded dispensing files, including their contents.",
    why: "Files are uploaded directly with short-lived presigned URLs and read back through an authorised endpoint. Storing them in the database was rejected: it would make every list query carry the weight of every file.",
    when: "On upload, and on an authorised read of a raw document.",
  },
  {
    name: "Email relay",
    role: "Transactional mail",
    data: "Recipient addresses, user names, workspace names and the links in the message.",
    why: "Invitations, password resets and status notifications are sent over SMTP. Mail delivery is best-effort and never blocks the action that triggered it.",
    when: "When a notification is dispatched. File contents are never included in mail.",
  },
  {
    name: "Analysis service",
    role: "Optional, off by default",
    data: "Depends entirely on the deployment's configuration. With the service enabled, filing content submitted for analysis.",
    why: "An optional external analysis step. It is disabled unless explicitly configured, and no analysis endpoint is contacted on a default deployment.",
    when: "Only when explicitly enabled for a deployment.",
  },
];

const NOTES = [
  "Local development uses on-disk file storage and the log for mail, so a development deployment contacts neither the storage provider nor the relay.",
  "No advertising, analytics or third-party tracking scripts are loaded on any page of this site or the application.",
  "We do not sell, share or license customer data to anyone.",
  "We will notify affected customers before adding a new subprocessor, and the change will appear on this page.",
];

export default function SubprocessorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Subprocessors"
        title="Everyone who processes your data."
        lede="Transcribed from deployment configuration rather than memory, because a stale subprocessor list is a finding in any vendor review."
      />

      <section className="section pb-20">
        <div className="space-y-5">
          {PROCESSORS.map((processor) => (
            <div key={processor.name} className="card p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 className="text-[15px] font-medium text-ink">{processor.name}</h2>
                <p className="font-mono text-[11px] text-muted">{processor.role}</p>
              </div>
              <div className="signature-rule-muted mt-5 h-px" />

              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="req-field-label">Data processed</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">{processor.data}</dd>
                </div>
                <div>
                  <dt className="req-field-label">Why it is in the list</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">{processor.why}</dd>
                </div>
              </dl>

              <p className="mt-5 border-t border-hairline pt-4 text-[12px] text-muted">
                <span className="req-field-label">Contacted: </span>
                {processor.when}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHead eyebrow="Notes" title="Worth stating explicitly." />
              <ul className="mt-8 space-y-4 text-[13px] leading-relaxed text-muted">
                {NOTES.map((note) => (
                  <li key={note} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] text-accent">→</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionHead
                eyebrow="Data we hold"
                title="What SiroQ itself keeps."
                lede="Separate from the list above: the records we hold about your organisation and users."
              />
              <div className="mt-8 prose-doc max-w-none">
                <ul>
                  <li>Organisation and pharmacy names, and the addresses of invited users.</li>
                  <li>Password hashes, never plaintext or reversibly-encrypted passwords.</li>
                  <li>Session records, stored hashed, so a cookie value cannot be replayed from a database dump.</li>
                  <li>Filing references, status history, findings and report contents.</li>
                  <li>Server logs containing request metadata, retained for a period agreed in the contract.</li>
                </ul>
                <p>
                  Contact records submitted through the contact form are delivered to the team inbox
                  and are not retained in the application database.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Need the current list in writing?"
        body="The data processing addendum attaches this list by reference and commits us to notifying you before it changes."
        primary={{ href: "/dpa", label: "Read the DPA" }}
        secondary={{ href: "/contact", label: "Ask a question" }}
      />
    </>
  );
}
