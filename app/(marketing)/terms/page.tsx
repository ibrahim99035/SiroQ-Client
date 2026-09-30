export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of service</h1>
      <div className="signature-rule mt-6 h-[3px] w-14 bg-[var(--accent-warm)]" />
      <p className="mt-4 font-mono text-xs text-muted">Last revised September 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
        <section>
          <h2 className="text-lg font-semibold text-ink">1. Nature of the service</h2>
          <p className="mt-3 text-muted">
            Requis is a multi-tenant review workspace for pharmacy application filings. It runs
            against a live backend: accounts, organisations, pharmacies, filings, uploaded files, and
            report output are stored in a hosted database and private object storage, and persist
            beyond your browser session.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">2. Use of the workspace</h2>
          <p className="mt-3 text-muted">
            You are responsible for the material you submit through your account. Do not upload
            dispensing records that contain patient health information unless your organisation has
            established a lawful basis and appropriate safeguards for doing so; the service stores
            and authenticates access to files but does not de-identify or redact their contents.
            Access is limited to the organisation you are assigned to, and you must not attempt to
            reach another organisation&rsquo;s records.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">3. Reports and analysis output</h2>
          <p className="mt-3 text-muted">
            A report records the output of an analysis run produced outside this service and attached
            to a filing by an administrator. Reports are attached to a filing and preserved for the
            audit trail; they are not regenerated on demand and are not recalculated if the source
            data changes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">4. No warranty</h2>
          <p className="mt-3 text-muted">
            The service is provided “as is” without warranties of any kind. The operators accept no
            liability for decisions made on the basis of a report or any other output.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">5. Billing</h2>
          <p className="mt-3 text-muted">
            Payment and billing flows are out of scope. Pricing pages are illustrative and no
            charges are ever incurred.
          </p>
        </section>
      </div>
    </div>
  );
}