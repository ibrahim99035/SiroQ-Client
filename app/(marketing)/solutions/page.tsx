import Link from "next/link";
import { CtaBand, PageHeader, SectionHead, Stat } from "@/components/marketing";
import { SOLUTIONS } from "@/lib/marketing-content";

export const metadata = {
  title: "Solutions — SiroQ",
  description:
    "How SiroQ serves dispensing pharmacies, care associations, compliance officers and the auditors who read their work.",
};

export default function SolutionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Solutions"
        title="Four people, one filing, four different questions."
        lede="The platform does not change per audience. What changes is which question you are holding, and which part of the record you are allowed to see."
      >
        <nav className="flex flex-wrap gap-2" aria-label="Audiences">
          {SOLUTIONS.map((solution) => (
            <a
              key={solution.slug}
              href={`#${solution.slug}`}
              className="rounded-full border border-hairline px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-accent hover:text-ink"
            >
              {solution.audience}
            </a>
          ))}
        </nav>
      </PageHeader>

      {SOLUTIONS.map((solution, index) => (
        <section
          key={solution.slug}
          id={solution.slug}
          className={`scroll-mt-20 border-t border-hairline ${
            index % 2 === 1 ? "bg-paper-raised" : ""
          }`}
        >
          <div className="section py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div>
                <p className="eyebrow">{solution.audience}</p>
                <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-ink">
                  {solution.headline}
                </h2>
                <div className="signature-rule mt-6" />
                <p className="mt-6 text-[15px] leading-relaxed text-muted">{solution.body}</p>
              </div>

              <div className="card p-7">
                <p className="req-field-label">What changes for them</p>
                <ul className="mt-4 space-y-4">
                  {solution.outcomes.map((outcome) => (
                    <li key={outcome} className="flex gap-3 text-[14px] leading-relaxed text-muted">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] text-accent-strong"
                      >
                        ✓
                      </span>
                      {outcome}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="Fit check"
            title="Three questions that decide whether this is for you."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                q: "Do your records arrive by attachment?",
                a: "If submissions are email attachments, the first win is a receipt and a reference. That alone is usually worth the change.",
              },
              {
                q: "Can you answer who moved a filing last month?",
                a: "If reconstructing that takes an afternoon, the chain of custody is the feature to evaluate first.",
              },
              {
                q: "Do you file across more than one pharmacy?",
                a: "Association scope and the per-pharmacy boundary are only interesting if you run a portfolio rather than one site.",
              },
            ].map((item) => (
              <div key={item.q} className="card p-7">
                <h3 className="text-[15px] font-medium text-ink">{item.q}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Stat label="Typical onboarding" value="One filing" />
            <Stat label="Bulk import" value="Not yet" />
            <Stat label="Self-hosting" value="Not supported" />
          </div>
          <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
            Two of those three answers are limits rather than features, and they are worth knowing
            before you plan a rollout. Both are on{" "}
            <Link href="/faq" className="text-accent underline underline-offset-2">
              the FAQ
            </Link>
            .
          </p>
        </div>
      </section>

      <CtaBand
        title="Bring one submission."
        body="The fastest way to judge this is to file a real period's export and see what the timeline looks like afterwards."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/customers", label: "Read a deployment story" }}
      />
    </>
  );
}
