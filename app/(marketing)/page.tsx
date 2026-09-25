import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="relative pb-16 pt-16 sm:pt-24">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-[12%] -top-24 h-[440px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(46,111,106,0.13),transparent)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(201,122,61,0.09),transparent)]"
        />
        <div className="relative">
          <p className="font-mono text-xs text-muted">
            requis n-2026 · staging, triage, reporting
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Filing reviews with the rigor of a lab requisition.
          </h1>
          <div className="signature-rule mt-6" />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
            Requis is the review workspace where pharmacy associations file dispensing records and
            review teams report on them. Every filing keeps a visible chain of custody — who staged
            it, who reviewed it, who reported it — from upload to stamped result.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="rounded-[10px] bg-[linear-gradient(180deg,#d08448,var(--accent-warm-strong))] px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-all hover:shadow hover:brightness-[1.06]"
            >
              Open the workspace
            </Link>
            <Link
              href="/pricing"
              className="rounded-[10px] border border-hairline bg-paper-raised px-5 py-2.5 text-sm text-ink shadow-soft transition-colors hover:border-accent hover:text-accent"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Spec strip */}
      <section aria-label="At a glance" className="pb-16">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Filing statuses", value: "4" },
            { label: "Seeded associations", value: "2" },
            { label: "Seeded users", value: "11" },
            { label: "Review time basis", value: "history" },
          ].map((item) => (
            <div key={item.label} className="card px-5 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {item.label}
              </p>
              <p className="stat-figure mt-1.5">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section id="process" className="scroll-mt-20 pb-16" aria-labelledby="process-title">
        <h2 id="process-title" className="text-2xl font-semibold tracking-tight text-ink">
          From staging to report
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Stage files",
              body: "Pharmacy workers drag dispensing ledgers (.xlsx or .csv) into the intake form. Each file is checked for extension and a simulated schema pass, and every row lands in the file ledger with its own validation verdict.",
            },
            {
              n: "02",
              title: "Review",
              body: "Review teams triage filings through a status timeline that records who moved the filing and when. Association admins keep their own network; nothing leaks across tenants.",
            },
            {
              n: "03",
              title: "Report",
              body: "Super admins attach a generated report — results field by field, raw data tucked behind a toggle. The filing is stamped reported and re-scored in every scoped list.",
            },
          ].map((step) => (
            <div key={step.n} className="card relative overflow-hidden px-5 py-6">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,var(--accent),transparent)]"
              />
              <p className="font-mono text-sm text-accent">{step.n}</p>
              <h3 className="mt-1.5 text-base font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Status language */}
      <section className="card px-6 py-8" aria-label="Status stamps">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              A status is a stamp, not a pill
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Four plain states, always rendered as a colored stamp with a read name. No pastel
              ambiguity on a review floor — every stamp means exactly one thing.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            <li><StatusBadge status="pending" /></li>
            <li><StatusBadge status="in_review" /></li>
            <li><StatusBadge status="reported" /></li>
            <li><StatusBadge status="rejected" /></li>
          </ul>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-20 py-16" aria-labelledby="roles-title">
        <h2 id="roles-title" className="text-2xl font-semibold tracking-tight text-ink">
          Four roles, one scoping rule
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Access is decided in a single permission engine. Every view is re-scoped when the acting
          identity changes — switch users from the top bar and watch the data obey.
        </p>
        <div className="mt-6 overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
          <table className="ruled-table min-w-[640px]">
            <thead>
              <tr>
                <th>Role</th>
                <th>Scope</th>
                <th>Can do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium text-ink">Super admin</td>
                <td>Everything</td>
                <td>Attach reports, manage associations, pharmacies, users</td>
              </tr>
              <tr>
                <td className="font-medium text-ink">Moderator</td>
                <td>Everything, read-only</td>
                <td>Review state and reports; no mutating controls</td>
              </tr>
              <tr>
                <td className="font-medium text-ink">Association admin</td>
                <td>One association</td>
                <td>Invite and manage users inside their network</td>
              </tr>
              <tr>
                <td className="font-medium text-ink">Pharmacy worker</td>
                <td>One pharmacy</td>
                <td>Create filings for their own pharmacy only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-16" aria-label="Get started">
        <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#12312e,#1f5650)] px-8 py-10 text-paper-raised shadow-lift">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(46,111,106,0.6),transparent_65%)]"
          />
          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Walk every role in under two minutes.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-paper-raised/70">
                No real backend, no real filings — a mock data layer with eleven identities and a
                complete review lifecycle.
              </p>
            </div>
            <Link
              href="/signup"
              className="rounded-[10px] bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-lg transition-all hover:bg-paper-raised/90 hover:shadow-xl"
            >
              Start the preview
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}