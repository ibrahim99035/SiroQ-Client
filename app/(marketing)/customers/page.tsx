import Link from "next/link";
import { CtaBand, PageHeader, SectionHead, Stat } from "@/components/marketing";

export const metadata = {
  title: "Customers — SiroQ",
  description:
    "How dispensing review teams run submission and audit on SiroQ — and why our deployment stories are labelled as pilots rather than presented as customer logos.",
};

/**
 * Deployments are described as pilots, with composite accounts and no invented
 * numbers. The alternative — named logos and fabricated savings figures — is the
 * single most common way a vendor page becomes a liability, so the page says
 * plainly what kind of evidence is behind each claim.
 */
export default function CustomersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Pilots, and what we are allowed to claim."
        lede="SiroQ is early. We run pilots rather than reference accounts, so this page describes deployments honestly — composite accounts, anonymised, with the limits of the evidence stated underneath."
      />

      <section className="section pb-16">
        <div className="well px-6 py-5">
          <p className="text-[13px] font-medium text-ink">On the quotes below</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Pilot deployments are anonymised and their accounts are composite, so names are changed
            and figures are indicative of one deployment rather than an average. Where a metric
            would imply a measured result we do not have, we have left it out. As public references
            become available we will replace these with named, quotable accounts and say when they
            were added.
          </p>
        </div>
      </section>

      {/* Deployment stories. */}
      <section className="section pb-24">
        <div className="space-y-6">
          {[
            {
              id: "association-portfolio",
              title: "Multi-pharmacy association moving off a shared drive",
              context:
                "Seven member pharmacies were submitting dispensing exports by email into a shared folder, with a spreadsheet tracking what had arrived.",
              problem:
                "Nobody could say which file had been received on which date, and reconstructing a single submission's history meant reading an inbox thread.",
              change: [
                "Each submission became a filing with a reference the association could quote.",
                "Per-file checksums made a disputed record checkable.",
                "Rejections arrived with the missing columns named, instead of discovered at review.",
              ],
              outcome:
                "The queue became the shared view. Submission status was answerable without opening an inbox, which was the entire point of the change.",
            },
            {
              id: "single-pharmacy",
              title: "Independent pharmacy formalising an informal process",
              context:
                "A single site with two people sharing the submission duty, using a laptop and a folder.",
              problem:
                "The handover depended on one person's memory. When they were away, submissions queued silently and nobody could tell whether a file had been sent.",
              change: [
                "Invitations replaced shared credentials — two named users, each with their own session.",
                "The timeline made the queue visible rather than remembered.",
              ],
              outcome:
                "The visible part mattered more than the tooling. A pending filing that nobody had touched was now obvious to both people, because the queue said so.",
            },
          ].map((story) => (
            <article key={story.id} className="card overflow-hidden p-0">
              <div className="border-b border-hairline px-7 py-6">
                <h2 className="text-lg font-semibold tracking-tight text-ink">{story.title}</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{story.context}</p>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="border-b border-hairline p-7 md:border-b-0 md:border-r">
                  <p className="req-field-label">The problem</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">{story.problem}</p>
                  <p className="req-field-label mt-6">What changed</p>
                  <ul className="mt-2 space-y-2 text-[13px] text-muted">
                    {story.change.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent">
                          →
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-7">
                  <p className="req-field-label">What it is used for now</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">{story.outcome}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Aggregate framing. */}
      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="In aggregate"
            title="What every deployment has in common."
            lede="Consistent across pilots so far, which is why we think the problem is real rather than specific to one organisation."
          />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Shared drives retired" value="Every pilot" />
            <Stat label="Shared credentials" value="None" />
            <Stat label="Submissions by attachment" value="None" />
            <Stat label="Bulk import needed" value="All of them" />
          </div>
          <p className="mt-8 max-w-2xl text-[13px] leading-relaxed text-muted">
            The fourth row is the one we are working on. Every pilot has asked for a bulk importer,
            and it does not exist yet — it is the most-requested item on the roadmap.
          </p>
        </div>
      </section>

      <section className="section py-20">
        <SectionHead
          eyebrow="Become a reference"
          title="If your pilot goes well, we will ask."
          lede="When a deployment is working and the people running it are willing, we ask whether they will take a call. It is a request, not a default."
        />
        <Link
          href="/contact"
          className="mt-8 inline-block rounded-[10px] border border-hairline px-5 py-2.5 text-sm text-ink transition-colors hover:border-accent"
        >
          Start a conversation
        </Link>
      </section>

      <CtaBand
        title="Run your own pilot."
        body="One association, one real period's export, and an honest read on whether this fits your process."
        primary={{ href: "/signup", label: "Create an association" }}
        secondary={{ href: "/solutions", label: "See who it fits" }}
      />
    </>
  );
}
