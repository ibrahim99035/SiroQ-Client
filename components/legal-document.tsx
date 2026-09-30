import type { ReactNode } from "react";

/**
 * Wrapper for the long-form legal documents (privacy, terms, cookies, DPA).
 *
 * Six pages share one shape: a title, an effective date, an optional intro, and
 * a numbered set of sections with stable anchors. Only the wrapper knows how to
 * render that, so the pages carry content and nothing else — which is what makes
 * a diff to a clause legible as a clause change rather than as a layout change.
 *
 * The effective date is a single constant on purpose. Four legal pages drifting
 * to four different dates is the kind of inconsistency that gets noticed during
 * a procurement review.
 */

export const LEGAL_EFFECTIVE = "18 September 2026";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode[];
}

export function LegalDocument({
  title,
  updated = LEGAL_EFFECTIVE,
  intro,
  sections,
  after,
}: {
  title: string;
  updated?: string;
  intro?: ReactNode;
  sections: LegalSection[];
  after?: ReactNode;
}) {
  return (
    <>
      <header className="section pb-12 pt-14 sm:pt-20">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <div className="signature-rule mt-6" />
        <p className="mt-5 font-mono text-[11px] text-muted">Effective {updated}</p>
        {intro ? <div className="prose-doc mt-8 max-w-2xl">{intro}</div> : null}
      </header>

      <div className="section grid gap-12 pb-24 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        {/* Sticky contents rail. Omitted entirely on narrow screens, where a
            section index is more disruptive than useful. */}
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="req-field-label">Contents</p>
            <ol className="mt-3 space-y-1.5 text-[12px]">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block text-muted transition-colors hover:text-ink"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="prose-doc max-w-2xl">
          {sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>

      {after}
    </>
  );
}
