export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy notice</h1>
      <div className="signature-rule mt-6 h-[3px] w-14 bg-[var(--accent-warm)]" />
      <p className="mt-4 font-mono text-xs text-muted">Last revised September 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
        <section>
          <h2 className="text-lg font-semibold text-ink">1. What the preview stores</h2>
          <p className="mt-3 text-muted">
            Requis keeps its dataset in browser memory only. Opening or reloading the preview
            resets the workspace to the seeded mock identities. Nothing is written to a server.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">2. Files and records</h2>
          <p className="mt-3 text-muted">
            Files added through the intake form are validated by filename and a simulated schema
            pass, then held only for the life of the session. They are not transmitted, parsed, or
            stored by any external service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">3. Identities</h2>
          <p className="mt-3 text-muted">
            The “Viewing as” switch selects one of the seeded identities. No real personal data is
            collected. Accounts created on the sign-up form exist only in the session dataset.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">4. Third parties</h2>
          <p className="mt-3 text-muted">
            Fonts are served from Google Fonts; the Google Fonts privacy policy applies to the
            transmission of the font files themselves. No analytics or tracking is installed.
          </p>
        </section>
      </div>
    </div>
  );
}