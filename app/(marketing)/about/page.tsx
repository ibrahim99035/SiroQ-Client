import Link from "next/link";
import { CtaBand, PageHeader, SectionHead } from "@/components/marketing";
import { POSTS } from "@/lib/marketing-content";

export const metadata = {
  title: "About — SiroQ",
  description:
    "SiroQ builds an auditable review workspace for pharmacy dispensing records. Why it exists, what it refuses to claim, and where to read the reasoning.",
};

const PRINCIPLES = [
  {
    title: "Write the audit event inside the transaction",
    body: "The temptation is always to update the record, then append the log. If the process dies between the two, the record moved and nobody can say so. Writing both together removes a whole class of undetectable gap.",
  },
  {
    title: "Never accept a scope from the client",
    body: "A tenant id, an association id or a role supplied by the browser is an authorisation decision the user made. Scope comes from the signed session, on every request, and no route gets an exception.",
  },
  {
    title: "Store the document, not a filename",
    body: "A record called dispensing.csv is not a record. We parse it, count what is in it, hash it, and bind the findings to the filing — so the report describes the file that arrived.",
  },
  {
    title: "Say what is not built",
    body: "There is no SOC 2 report, no rate limiting, no bulk importer and no self-hosting. Each is listed on the compliance or FAQ page. A vendor page that overstates its posture costs more trust than the posture was worth.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Built around the question an auditor actually asks."
        lede="Not “did you store the file” but “tell me who changed this”. That question is dull, specific, and the reason most dispensing submissions get reconstructed after the fact."
      />

      <section className="section pb-16">
        <div className="max-w-2xl text-[15px] leading-relaxed text-muted">
          <p>
            Pharmacy dispensing records are usually submitted by email. A file is exported from one
            system, attached to a message, and dropped into a folder. It works, right up until
            something is queried — and then the real work is not the query, it is finding out what
            happened.
          </p>
          <p className="mt-4">
            SiroQ treats that gap as the product. A submission becomes a filing with a reference
            you can quote. Every file is parsed and hashed. Every state change is written server-side
            with its actor. The report is attached and cannot be quietly replaced. The point is not
            that the software is thorough; the point is that the answer already exists.
          </p>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead eyebrow="Principles" title="Four decisions that shaped the codebase." />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="card p-7">
                <h3 className="text-[15px] font-medium text-ink">{principle.title}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{principle.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead
              eyebrow="What we are"
              title="A small team shipping to dispensing teams."
              lede="Close to the users who file, review and sign for these records. When a pilot asks for a bulk importer, that goes on the roadmap rather than into a backlog."
            />
            <Link
              href="/contact"
              className="mt-8 inline-block rounded-[10px] border border-hairline px-5 py-2.5 text-sm text-ink transition-colors hover:border-accent"
            >
              Get in touch
            </Link>
          </div>
          <div>
            <SectionHead eyebrow="What we are not" title="Not a compliance programme." />
            <div className="mt-6 space-y-4 text-[13px] leading-relaxed text-muted">
              <p>
                SiroQ produces a better record of a review. It does not make an organisation
                compliant, and the compliance page lists what is genuinely in place rather than
                implying a certification we do not hold.
              </p>
              <p>
                Nor are we an analysis engine. Validation is a column contract and an optional
                external service; the lifecycle, the trail and the tenant boundaries are the part
                we build.
              </p>
              <Link
                href="/compliance"
                className="inline-block text-accent underline underline-offset-2"
              >
                Read the compliance posture →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead eyebrow="Reading" title="Where the reasoning is written down." />
          <ul className="mt-10 divide-y divide-hairline border-y border-hairline">
            {POSTS.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    {post.category}
                  </span>
                  <span className="text-[14px] font-medium text-ink group-hover:text-accent-strong">
                    {post.title}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted">{post.readingTime}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title="Try it against one filing."
        body="The whole argument is easier to judge from the product than from a page about the product."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/docs", label: "Read the docs" }}
      />
    </>
  );
}
