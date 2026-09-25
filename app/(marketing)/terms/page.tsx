export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of service</h1>
      <div className="signature-rule mt-6 h-[3px] w-14 bg-[var(--accent-warm)]" />
      <p className="mt-4 font-mono text-xs text-muted">Last revised September 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
        <section>
          <h2 className="text-lg font-semibold text-ink">1. Purpose of this preview</h2>
          <p className="mt-3 text-muted">
            Requis is an interactive product preview built against a mock data layer. There is no
            live backend, no database, and no processing of real dispensing records. Anything you
            stage, review, or report persists only in the memory of your current session.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">2. Use of the workspace</h2>
          <p className="mt-3 text-muted">
            You may explore every seeded role and workflow for evaluation purposes. You agree not
            to upload files containing real patient health information, since the preview performs
            no real parsing or protection of that data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">3. Simulated data and reports</h2>
          <p className="mt-3 text-muted">
            Reports attached in the preview are generated deterministically from ledger metadata.
            They are illustrative and must not be relied upon for regulatory purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">4. No warranty</h2>
          <p className="mt-3 text-muted">
            The preview is provided “as is” without warranties of any kind. The operators accept
            no liability for decisions made on the basis of the simulated output.
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