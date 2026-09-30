import Link from "next/link";
import {
  CtaBand,
  DisclosureList,
  Icon,
  Panel,
  SectionHead,
} from "@/components/marketing";
import { FAQ, FEATURES, POSTS, SOLUTIONS } from "@/lib/marketing-content";

/**
 * Landing page.
 *
 * Ordered the way the argument actually builds: what the product is, who it is
 * for, what it does, how the four-step workflow runs, why the audit trail is
 * trustworthy, what it costs, and what to read next.
 */

export default function MarketingHomePage() {
  const featured = FEATURES.slice(0, 6);

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_32rem_at_50%_-8rem,rgba(2,62,47,0.10),transparent)]"
        />
        <div className="section relative pb-20 pt-20 sm:pb-28 sm:pt-28">
          <div className="max-w-3xl">
            <p className="eyebrow">Dispensing records · Review · Chain of custody</p>
            <h1 className="mt-5 text-[2.5rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[3.5rem]">
              Every dispensing record you accept,
              <span className="block text-accent-strong">with the trail to prove it.</span>
            </h1>
            <div className="signature-rule mt-8" />
            <p className="mt-8 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              SiroQ is the review workspace between a pharmacy&apos;s dispensing export and the
              report someone eventually signs for. Records are parsed, validated and tracked as
              filings with real references — and every status change is written server-side, in the
              same transaction as the change itself.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-all hover:brightness-[1.07]"
              >
                Create an association
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-[10px] border border-hairline px-5 py-2.5 text-sm text-ink transition-colors hover:border-accent"
              >
                See the workflow
              </Link>
            </div>

            <p className="mt-5 font-mono text-[11px] text-muted">
              Invite-only · No card required · Tenant-scoped from the first request
            </p>
          </div>

          {/* Product surface: a filing, its trail, and the raw document beside it. */}
          <div className="mt-16 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  Filing AP-2026-0142
                </p>
                <span className="stamp stamp-in_review">In review</span>
              </div>
              <dl className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
                {[
                  ["Pharmacy", "North Point Rx"],
                  ["Period", "1 – 15 March 2026"],
                  ["Files", "2 files · 4,180 rows"],
                  ["Findings", "12 rows flagged"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="req-field-label">{label}</dt>
                    <dd className="mt-1 text-[13px] font-medium text-ink tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-hairline bg-paper-raised px-5 py-4">
                <p className="req-field-label">Chain of custody</p>
                <ol className="mt-3 space-y-2.5">
                  {[
                    ["Submitted", "by A. Okonkwo", "08:41", "stamp-pending"],
                    ["Moved to review", "by R. Villanueva", "09:02", "stamp-in_review"],
                    ["Findings confirmed", "by R. Villanueva", "13:18", "stamp-in_review"],
                  ].map(([event, actor, time, tone]) => (
                    <li key={event} className="flex items-center gap-3 text-[12px]">
                      <span aria-hidden="true" className={`stamp ${tone} px-1.5 py-0.5 text-[9px]`}>
                        ●
                      </span>
                      <span className="font-medium text-ink">{event}</span>
                      <span className="text-muted">{actor}</span>
                      <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
                        {time}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="card flex flex-col p-6">
              <p className="req-field-label">Stored document</p>
              <p className="mt-2 font-mono text-[12px] text-ink">
                {/* A filename in a monospace panel: an artefact, not copy. */}
                {"dispensing-2026-03-15.csv"}
              </p>
              <ul className="mt-5 space-y-2.5 font-mono text-[11px] text-muted">
                {[
                  "sha256    4f9c…b7e1",
                  "rows      4,180",
                  "columns   9 detected",
                  "manifest  NDC code · Batch number present",
                  "verdict   warning · 12 ragged rows",
                ].map((line) => (
                  <li key={line} className="flex justify-between gap-3">
                    <span>{line.split(/\s{2,}/)[0]}</span>
                    <span className="truncate text-ink">{line.split(/\s{2,}/).slice(1).join(" ").trim()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <Link
                  href="/features/chain-of-custody"
                  className="text-[13px] font-medium text-accent underline-offset-4 hover:underline"
                >
                  Why the trail is hard to argue with →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- problem */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="The handover problem"
            title="A shared folder is not a record of what happened."
            lede="Dispensing exports get emailed, dropped in a drive, and reconciled by hand. It works right up until someone has to prove what was received, who reviewed it, and who signed it off."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Receipts are unverifiable",
                body: "An attachment in an inbox cannot answer whether the file that arrived is the file that was sent.",
              },
              {
                title: "History is reconstructed",
                body: "When a filing moves, the trail is usually reconstructed later from timestamps — if the timestamps survived.",
              },
              {
                title: "Silence looks like compliance",
                body: "A queue nobody revisits produces the same outcome as a queue where nothing was found.",
              },
            ].map((item) => (
              <Panel key={item.title} title={item.title} description={item.body} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ audience */}
      <section className="section py-24">
        <SectionHead
          eyebrow="Who it is for"
          title="One workflow, four vantage points."
          lede="The same filing, read by the people who submit it, run it, sign it off and audit it."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SOLUTIONS.map((solution) => (
            <div key={solution.slug} className="card flex flex-col p-7">
              <p className="eyebrow">{solution.audience}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink">
                {solution.headline}
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{solution.body}</p>
              <ul className="mt-5 space-y-2 text-[13px] text-muted">
                {solution.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] text-accent">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="m2 6.2 2.4 2.4L10 3"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {outcome}
                  </li>
                ))}
              </ul>
              <Link
                href={`/solutions#${solution.slug}`}
                className="mt-6 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
              >
                Read the {solution.audience.toLowerCase()} story →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-24">
          <SectionHead
            eyebrow="What it does"
            title="Six parts that each earn their place."
            lede="Nothing here is decorative. Each item below exists because a specific handover question goes unanswered without it."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((feature) => (
              <Panel
                key={feature.slug}
                title={feature.title}
                description={feature.summary}
                icon={<Icon name={feature.icon} />}
              >
                <ul className="space-y-1.5">
                  {feature.points.slice(0, 2).map((point) => (
                    <li key={point} className="flex gap-2">
                      <span aria-hidden="true" className="text-hairline">
                        ·
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/features#${feature.slug}`}
                  className="mt-4 inline-block text-[12px] font-medium text-accent underline-offset-4 hover:underline"
                >
                  Details →
                </Link>
              </Panel>
            ))}
          </div>
          <div className="mt-10">
            <Link
              href="/features"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All eight capabilities →
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section className="section py-24">
        <SectionHead
          eyebrow="How it works"
          title="Four steps, and the trail runs through all of them."
          lede="Nothing is skipped between submission and report. Each transition writes its own audit event."
        />
        <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              title: "Submit",
              body: "A pharmacy uploads a dispensing export against a new filing. Bytes are stored first, then the filing is created — an interrupted transfer leaves no half-filing behind.",
            },
            {
              n: "02",
              title: "Validate",
              body: "The file is parsed and checked against the column contract. Findings are stored against the filing, so the reviewer sees the same rows and the same wording every time.",
            },
            {
              n: "03",
              title: "Review",
              body: "An administrator works the queue. Every move between states is recorded with the actor and the time, in the same transaction as the change.",
            },
            {
              n: "04",
              title: "Report",
              body: "A super admin attaches the report. It becomes the delivered result and cannot be quietly replaced — correcting one means reopening the filing, which is audited too.",
            },
          ].map((step) => (
            <li key={step.n} className="card p-6">
              <p className="font-mono text-[11px] tracking-[0.12em] text-accent">{step.n}</p>
              <h3 className="mt-3 text-[15px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <Link
            href="/how-it-works"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            The full workflow, including failure states →
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------------------- trust */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <SectionHead
                eyebrow="Trust posture"
                title="We would rather understate it."
                lede="SiroQ is pre-certification, so the security page lists what is in place, what is being built, and what is missing — including rate limiting, which is not implemented yet. If a control is absent, you will find it written down rather than absent from the page."
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/security"
                  className="rounded-[10px] border border-hairline px-4 py-2 text-[13px] text-ink transition-colors hover:border-accent"
                >
                  Security
                </Link>
                <Link
                  href="/compliance"
                  className="rounded-[10px] border border-hairline px-4 py-2 text-[13px] text-ink transition-colors hover:border-accent"
                >
                  Compliance
                </Link>
                <Link
                  href="/subprocessors"
                  className="rounded-[10px] border border-hairline px-4 py-2 text-[13px] text-ink transition-colors hover:border-accent"
                >
                  Subprocessors
                </Link>
              </div>
            </div>
            <div className="grid gap-3">
              {[
                ["Server-written audit trail", "Status events are written in the transaction that moves the filing, not after it."],
                ["Session-derived scope", "No route accepts a tenant or role from the client; scope comes from the signed session on every request."],
                ["Hashed session cookies", "Opaque, hashed at rest, and revocable — deactivating a user ends their sessions immediately."],
                ["Published subprocessors", "Every processor with a data category is named on one page, not scattered across contracts."],
              ].map(([title, body]) => (
                <div key={title} className="well px-5 py-4">
                  <p className="text-[13px] font-medium text-ink">{title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- pricing */}
      <section className="section py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            eyebrow="Pricing"
            title="Per association, not per file."
            lede="The unit is the association running the review. Adding a pharmacy or a user does not change the bill."
          />
          <Link
            href="/pricing"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            Full comparison →
          </Link>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { name: "Starter", price: "$0", note: "up to 3 pharmacies" },
            { name: "Professional", price: "$240", note: "per association / month", featured: true },
            { name: "Enterprise", price: "Custom", note: "annual agreement" },
          ].map((plan) => (
            <div
              key={plan.name}
              className={
                plan.featured
                  ? "relative rounded-card border border-accent bg-paper-raised p-7 shadow-soft"
                  : "card p-7"
              }
            >
              {plan.featured ? (
                <span className="absolute -top-2.5 left-7 rounded-full bg-accent px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--on-accent)]">
                  Most common
                </span>
              ) : null}
              <p className="text-[13px] font-medium text-ink">{plan.name}</p>
              <p className="stat-figure mt-4">{plan.price}</p>
              <p className="mt-1.5 font-mono text-[11px] text-muted">{plan.note}</p>
              <Link
                href={plan.name === "Enterprise" ? "/contact" : "/signup"}
                className={
                  plan.featured
                    ? "mt-6 block rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-4 py-2.5 text-center text-[13px] font-medium text-white"
                    : "mt-6 block rounded-[10px] border border-hairline px-4 py-2.5 text-center text-[13px] text-ink hover:border-accent"
                }
              >
                {plan.name === "Enterprise" ? "Contact us" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ customers */}
      <section className="border-y border-hairline bg-paper-raised">
        <div className="section py-24">
          <SectionHead
            eyebrow="In practice"
            title="What changed for the people running the queue."
          />
          <figure className="card mt-12 overflow-hidden p-0">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-hairline p-8 md:border-b-0 md:border-r">
                <blockquote className="text-[17px] leading-relaxed text-ink">
                  “The part that changed our week was not the analysis. It was that when someone
                  asked what happened to a submission, we could answer in a minute — with a reference
                  and a history, instead of an afternoon in the inbox.”
                </blockquote>
                <figcaption className="mt-6 font-mono text-[11px] text-muted">
                  Compliance lead, multi-pharmacy association
                </figcaption>
              </div>
              <div className="p-8">
                <ul className="space-y-5">
                  {[
                    ["Submission to confirmation", "Minutes, not days of email chasing"],
                    ["Missing-column rejections", "Named at upload, not discovered at review"],
                    ["Audit request", "Answered from the filing timeline"],
                  ].map(([label, value]) => (
                    <li key={label}>
                      <p className="req-field-label">{label}</p>
                      <p className="mt-1 text-[14px] font-medium text-ink">{value}</p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/customers"
                  className="mt-8 inline-block text-[13px] font-medium text-accent underline-offset-4 hover:underline"
                >
                  How we talk about pilot deployments →
                </Link>
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FAQ */}
      <section className="section py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.35fr]">
          <div>
            <SectionHead
              eyebrow="Questions"
              title="The ones we get asked first."
              lede="If yours is not here, the contact page reaches a person who can answer it."
            />
            <Link
              href="/faq"
              className="mt-6 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Full FAQ →
            </Link>
          </div>
          <DisclosureList items={FAQ.slice(0, 5).map(({ q, a }) => ({ q, a }))} />
        </div>
      </section>

      {/* --------------------------------------------------------------- writing */}
      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead eyebrow="Writing" title="On audit trails and dispensing data." />
            <Link
              href="/blog"
              className="text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              All articles →
            </Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {POSTS.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="card group p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  {post.category} · {post.readingTime}
                </p>
                <h3 className="mt-3 text-[15px] font-medium leading-snug text-ink group-hover:text-accent-strong">
                  {post.title}
                </h3>
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Start with one filing."
        body="Create an association, invite a pharmacy, and submit a single period's export. You will know whether this fits your process before rolling it out to a portfolio."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/contact", label: "Talk to us first" }}
      />
    </>
  );
}
