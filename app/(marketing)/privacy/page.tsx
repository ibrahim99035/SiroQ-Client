export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy notice</h1>
      <div className="signature-rule mt-6 h-[3px] w-14 bg-[var(--accent-warm)]" />
      <p className="mt-4 font-mono text-xs text-muted">Last revised September 2026</p>

      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
        <section>
          <h2 className="text-lg font-semibold text-ink">1. What the service stores</h2>
          <p className="mt-3 text-muted">
            Requis stores account, association, pharmacy, and filing records in a hosted PostgreSQL
            database. Records are scoped to an organisation: each request is authorised against the
            signed-in session, so one tenant cannot read another tenant&rsquo;s rows.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">2. Files and records</h2>
          <p className="mt-3 text-muted">
            Files added through the intake form are validated by filename and size, then stored in
            private object storage. The storage bucket is not publicly readable: a download requires
            an authenticated request that is authorised against the filing the file belongs to.
            A file is transmitted to the service and retained until an administrator removes it.
          </p>
          <p className="mt-3 text-muted">
            Submitted files are not read, parsed, or forwarded to any third-party service by
            Requis itself. Analysis is performed by an operator-run service, when one is configured,
            and its output is attached to the filing by an administrator.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">3. Identities and sessions</h2>
          <p className="mt-3 text-muted">
            Accounts are real. An account is created by invitation or sign-up and holds a real email
            address, display name, role, and organisation assignment. Sign-in issues a session whose
            cookie is httpOnly, Secure, and SameSite=Lax, so browser JavaScript cannot read it; only
            a SHA-256 digest of the session token is stored server-side. Sessions expire, and an
            administrator can revoke them. Signing out revokes the session immediately.
          </p>
          <p className="mt-3 text-muted">
            Passwords are stored as salted hashes, never in plain text. An account with a status of
            &ldquo;disabled&rdquo; cannot sign in, and its active sessions are revoked.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">4. Third parties</h2>
          <p className="mt-3 text-muted">
            The service is hosted on Neon (managed PostgreSQL and object storage), and outbound
            email is sent through Google SMTP. Fonts are served from Google Fonts; the Google Fonts
            privacy policy applies to the transmission of the font files themselves. No analytics or
            tracking is installed.
          </p>
        </section>
      </div>
    </div>
  );
}
