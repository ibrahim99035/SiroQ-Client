import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { PageHeader, SectionHead } from "@/components/marketing";

export const metadata = {
  title: "Contact — SiroQ",
  description:
    "Talk to the SiroQ team about pricing, a security review, a DPA, or running a pilot against a real dispensing file.",
};

/**
 * Scheduling link.
 *
 * Read from the environment rather than hardcoded, so a placeholder URL can
 * never ship to production and read as a real booking page. Unset means the
 * button is not rendered at all.
 */
const schedulingUrl = process.env.NEXT_PUBLIC_SCHEDULING_URL;

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Tell us what you are trying to do."
        lede="Pricing questions, security reviews, DPAs and pilots all land in the same inbox, and a person reads it."
      />

      <section className="section pb-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ContactForm />

          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-[14px] font-medium text-ink">Faster for a scheduled walkthrough</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                If you would rather talk it through than write it down, book a slot.
              </p>
              {schedulingUrl ? (
                <a
                  href={schedulingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-5 inline-block rounded-[10px] border border-hairline px-4 py-2.5 text-[13px] text-ink transition-colors hover:border-accent"
                >
                  Book a 30-minute call
                  <span aria-hidden="true" className="ml-1.5">
                    ↗
                  </span>
                </a>
              ) : (
                <p className="mt-5 text-[12px] leading-relaxed text-muted">
                  Scheduling is not configured on this deployment, so the form above is the route.
                </p>
              )}
            </div>

            <div className="card p-6">
              <h2 className="text-[14px] font-medium text-ink">Already have access?</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Support questions about a filing are faster through the app, where the filing
                reference is to hand.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/login"
                  className="rounded-[10px] border border-hairline px-4 py-2 text-[13px] text-ink hover:border-accent"
                >
                  Sign in
                </Link>
                <Link
                  href="/status"
                  className="rounded-[10px] border border-hairline px-4 py-2 text-[13px] text-ink hover:border-accent"
                >
                  Check status
                </Link>
              </div>
            </div>

            <div className="well px-6 py-5">
              <p className="text-[13px] font-medium text-ink">Security reports</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                If you have found a vulnerability, please do not use this form. Follow the
                disclosure process instead.
              </p>
              <Link
                href="/responsible-disclosure"
                className="mt-3 inline-block text-[13px] font-medium text-accent underline underline-offset-2"
              >
                Responsible disclosure →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-raised">
        <div className="section py-20">
          <SectionHead
            eyebrow="What to expect"
            title="How a message gets answered."
            lede="So you know whether to wait or chase."
          />
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["You send a message", "The form goes to the team inbox, with your address as the reply-to."],
              ["A person reads it", "Usually the same day within working hours. Not a ticket queue."],
              ["You get a straight answer", "Including “we do not support that yet”, if it is true."],
            ].map(([title, body], index) => (
              <li key={title} className="card p-6">
                <p className="font-mono text-[11px] tracking-[0.12em] text-accent">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-[14px] font-medium text-ink">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
