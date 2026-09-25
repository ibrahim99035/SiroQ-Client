import Link from "next/link";

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    cadence: "per association / month",
    blurb: "For a single pharmacy testing the workflow.",
    features: [
      "One association, up to 3 pharmacies",
      "Pharmacy worker filing intake",
      "Status timeline + file ledger",
      "Email support",
    ],
  },
  {
    name: "Professional",
    price: "$240",
    cadence: "per association / month",
    blurb: "For associations running regular review cycles.",
    features: [
      "Unlimited pharmacies",
      "Association admin user management",
      "Report attachment + raw data export",
      "Priority triage queue",
    ],
    recommended: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "annual agreement",
    blurb: "For networks that need operator governance.",
    features: [
      "Everything in Professional",
      "Multi-association super admin",
      "Audit trail export",
      "Dedicated review runs",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pb-16 pt-16 sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Pricing</h1>
        <div className="signature-rule mt-6 h-[3px] w-14 bg-[var(--accent-warm)]" />
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
          Flat per-association pricing, chosen so review cost is predictable. This preview is
          simulated — no payments run, and no cards are charged.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={
                tier.recommended
                  ? "relative rounded-card border border-accent/40 bg-paper-raised p-6 shadow-lift"
                  : "card p-6"
              }
            >
              {tier.recommended ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1 rounded-t-card bg-[linear-gradient(90deg,var(--accent),var(--accent-strong))]"
                />
              ) : null}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">{tier.name}</h2>
                {tier.recommended ? (
                  <span className="stamp stamp-reported">Recommended</span>
                ) : null}
              </div>
              <p className="mt-4">
                <span className="text-2xl font-semibold tracking-tight text-ink">{tier.price}</span>
                <span className="ml-2 font-mono text-[11px] text-muted">{tier.cadence}</span>
              </p>
              <p className="mt-2 text-sm text-muted">{tier.blurb}</p>
              <ul className="mt-5 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13.5px] text-ink">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={
                  tier.recommended
                    ? "mt-6 block rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-4 py-2.5 text-center text-sm font-medium text-white shadow-soft transition-all hover:shadow hover:brightness-[1.07]"
                    : "mt-6 block rounded-[10px] border border-hairline bg-paper-raised px-4 py-2.5 text-center text-sm text-ink shadow-soft transition-colors hover:border-accent hover:text-accent"
                }
              >
                Start the preview
              </Link>
            </div>
          ))}
        </div>

        <aside className="card mt-10 px-6 py-5">
          <h2 className="text-sm font-semibold text-ink">A note on the pricing copy</h2>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Billing is explicitly out of scope for this build. The three plans above are present
            so the public pages read as a complete product, but no payment flow exists behind
            them. The workspace itself is free to preview with the seeded identities.
          </p>
        </aside>
      </section>
    </div>
  );
}