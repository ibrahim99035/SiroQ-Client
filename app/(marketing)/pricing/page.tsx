import Link from "next/link";
import { CtaBand, DisclosureList, PageHeader, SectionHead } from "@/components/marketing";
import { COMPARISON, PLANS } from "@/lib/marketing-content";

export const metadata = {
  title: "Pricing — SiroQ",
  description:
    "SiroQ pricing is per association, not per file or per row. Compare Starter, Professional and Enterprise across features, limits and support.",
};

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "string") {
    return <td className="px-4 py-3 text-muted">{value}</td>;
  }
  return (
    <td className="px-4 py-3">
      {value ? (
        <>
          <span aria-hidden="true" className="text-accent">
            ✓
          </span>
          <span className="sr-only">Included</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="text-hairline">
            —
          </span>
          <span className="sr-only">Not included</span>
        </>
      )}
    </td>
  );
}

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Per association. Not per file, per row or per seat."
        lede="The billing unit is the association running the review. Adding pharmacies, users or submissions does not change the number on the invoice."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.recommended
                  ? "relative rounded-card border border-accent bg-paper-raised p-6 shadow-soft"
                  : "card p-6"
              }
            >
              {plan.recommended ? (
                <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--on-accent)]">
                  Most common
                </span>
              ) : null}
              <h2 className="text-[14px] font-medium text-ink">{plan.name}</h2>
              <p className="stat-figure mt-3">{plan.price}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">{plan.cadence}</p>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">{plan.blurb}</p>
            </div>
          ))}
        </div>
      </PageHeader>

      {/* Full comparison. */}
      <section className="section pb-16">
        <div className="overflow-hidden rounded-card border border-hairline">
          <div className="overflow-x-auto">
            <table className="ruled-table w-full min-w-[42rem] text-left text-[13px]">
              <caption className="sr-only">
                Feature comparison across Starter, Professional and Enterprise plans
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-4">
                    <span className="sr-only">Feature</span>
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.name}
                      scope="col"
                      className="px-4 py-4 text-center font-semibold text-ink"
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                      {row.label}
                    </th>
                    {/* Driven by the plan list, not the row, so a short row
                        cannot silently shift every later column left. */}
                    {PLANS.map((plan, column) => (
                      <Cell key={plan.name} value={row.values[column] ?? "—"} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {PLANS.map((plan) => (
            <Link
              key={plan.name}
              href={plan.cta.href}
              className={
                plan.recommended
                  ? "rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-sm font-medium text-white"
                  : "rounded-[10px] border border-hairline px-5 py-2.5 text-sm text-ink transition-colors hover:border-accent"
              }
            >
              {plan.name}: {plan.cta.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Honest billing notes. */}
      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="Billing"
            title="How this bills, stated plainly."
            lede="Pricing pages that omit the awkward parts generate a procurement conversation later. These are the terms that surprise people."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "No overage, no surprise",
                body: "There is no per-file or per-row charge, so a month where you submit three times as many records costs the same. Usage is not metered.",
              },
              {
                title: "Seats are not the unit",
                body: "Professional covers your association's users without per-seat pricing. Add a pharmacist or an auditor at no extra cost.",
              },
              {
                title: "Enterprise is negotiated",
                body: "Enterprise pricing depends on the agreement, so it is quoted rather than listed. That includes residency and retention terms.",
              },
            ].map((item) => (
              <div key={item.title} className="card p-7">
                <h3 className="text-[15px] font-medium text-ink">{item.title}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 max-w-3xl">
            <DisclosureList
              items={[
                {
                  q: "Is the free Starter plan a trial?",
                  a: "No. It is a permanent plan for one association with up to three pharmacies, not a countdown. If it fits, there is no reason to move, and we would rather you stayed on it than upgrade for its own sake.",
                },
                {
                  q: "Can I change plans mid-cycle?",
                  a: "Yes, in both directions. Upgrading takes effect immediately; a downgrade applies at the end of the current billing period so an in-flight review cycle is not interrupted.",
                },
                {
                  q: "What happens to my data if I downgrade or cancel?",
                  a: "Nothing is deleted automatically. Your filings, files and history stay retrievable, and we will confirm an export with you before anything is removed. Cancelling stops billing and access, and the retention window is agreed in writing rather than applied silently.",
                },
                {
                  q: "Do you offer discounts?",
                  a: "For registered non-profits and for annual prepayment on Professional. Contact us with the association type and we will say yes or no directly.",
                },
                {
                  q: "Is there a self-serve upgrade path?",
                  a: "Moving between Starter and Professional is self-serve. Enterprise is a conversation because the terms are negotiated.",
                },
              ]}
            />
          </div>

          <p className="mt-12 text-[13px] leading-relaxed text-muted">
            <Link href="/terms" className="text-accent underline underline-offset-2">
              terms of service
            </Link>{" "}
            and the{" "}
            <Link href="/dpa" className="text-accent underline underline-offset-2">
              data processing addendum
            </Link>
            .
          </p>
        </div>
      </section>

      <CtaBand
        title="Start on the free plan."
        body="One association, three pharmacies, the full lifecycle. Move up when the portfolio does, not before."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/contact", label: "Ask about Enterprise" }}
      />
    </>
  );
}
