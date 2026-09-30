import Link from "next/link";
import { CtaBand, Icon, PageHeader, SectionHead, Stat } from "@/components/marketing";
import { FEATURES, ROLE_MATRIX } from "@/lib/marketing-content";

export const metadata = {
  title: "Features — SiroQ",
  description:
    "File ingestion with real parsing, dispensing validation, server-written chain of custody, immutable reports, and tenant isolation enforced on every request.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Eight capabilities, each answering a handover question."
        lede="Grouped below by the question they answer. Where a capability is deliberately limited, the limitation is stated rather than left for you to discover during onboarding."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Accepted formats" value="CSV · XLSX" />
          <Stat label="Manifest columns" value="2" />
          <Stat label="Access roles" value="4" />
          <Stat label="Tenant checks" value="Every request" />
        </div>
      </PageHeader>

      <section className="section pb-8">
        <nav aria-label="Features" className="flex flex-wrap gap-2">
          {FEATURES.map((feature) => (
            <a
              key={feature.slug}
              href={`#${feature.slug}`}
              className="rounded-full border border-hairline px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-accent hover:text-ink"
            >
              {feature.title}
            </a>
          ))}
        </nav>
      </section>

      {FEATURES.map((feature, index) => (
        <section
          key={feature.slug}
          id={feature.slug}
          className={`scroll-mt-20 border-t border-hairline ${
            index % 2 === 1 ? "bg-paper-raised" : ""
          }`}
        >
          <div className="section py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
              <div>
                <div
                  aria-hidden="true"
                  className="grid h-10 w-10 place-items-center rounded-[12px] bg-accent-soft text-accent-strong"
                >
                  <Icon name={feature.icon} />
                </div>
                <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
                  {feature.title}
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">{feature.summary}</p>
              </div>
              <ul className="space-y-4">
                {feature.points.map((point) => (
                  <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-muted">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}

      {/* Roles are a feature like any other, and the boundary is the point. */}
      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="Access model"
            title="Four roles, and what each one cannot do."
            lede="A permission list without its refusals is marketing. These are the refusals, published."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {ROLE_MATRIX.map((entry) => (
              <div key={entry.role} className="card p-7">
                <h3 className="font-mono text-[12px] tracking-[0.06em] text-ink">{entry.role}</h3>
                <p className="mt-1.5 text-[12px] text-muted">{entry.audience}</p>

                <p className="req-field-label mt-6">Can</p>
                <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                  {entry.can.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>

                <p className="req-field-label mt-6">Cannot</p>
                <ul className="mt-2 space-y-1.5 text-[13px] text-muted">
                  {entry.cannot.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden="true" className="text-status-rejected">
                        ✕
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-10 text-[13px] text-muted">
            Scope is derived from the session on every request. No route accepts a tenant, an
            association or a role from the client — see{" "}
            <Link href="/docs#authorization" className="text-accent underline underline-offset-2">
              the authorization specification
            </Link>
            .
          </p>
        </div>
      </section>

      <CtaBand
        title="See it against a real file."
        body="Create an association and submit one period's export. The column contract, the findings and the timeline are all visible without a sales conversation."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/how-it-works", label: "Read the workflow" }}
      />
    </>
  );
}
