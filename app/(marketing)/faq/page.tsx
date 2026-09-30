import Link from "next/link";
import { CtaBand, DisclosureList, PageHeader } from "@/components/marketing";
import { FAQ } from "@/lib/marketing-content";

export const metadata = {
  title: "FAQ — SiroQ",
  description:
    "Answers about file formats, account creation, tenant isolation, report immutability, data residency, certification status and what SiroQ does not support yet.",
};

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title="Including the questions about what we do not support."
        lede="Grouped loosely by topic. Where the answer is “not yet”, it says so — the alternatives on this page are honest about the limits."
      />

      <section className="section pb-24">
        <div className="max-w-3xl">
          <DisclosureList items={FAQ.map(({ q, a }) => ({ q, a }))} />
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Still unanswered</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {[
              { href: "/docs", title: "Documentation", body: "Request contract, authorization spec and the file manifest." },
              { href: "/compliance", title: "Compliance posture", body: "What is in place, what is in progress, what is missing." },
              { href: "/contact", title: "Contact", body: "A person reads the message, usually the same working day." },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="card group p-6">
                <h3 className="text-[14px] font-medium text-ink group-hover:text-accent-strong">
                  {link.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{link.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Ask the awkward one."
        body="If something here is unclear or looks like a euphemism, that is a reason to email rather than to sign up."
        primary={{ href: "/contact", label: "Ask a question" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </>
  );
}
