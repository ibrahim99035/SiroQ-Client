import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import type { IconName } from "@/lib/marketing-content";

/**
 * Shared furniture for the public site: the footer, and the handful of
 * primitives every page composes from. Keeping them here means an interior page
 * is a list of sections rather than a wall of utility classes.
 */

const ICON_PATHS: Record<IconName, ReactNode> = {
  upload: (
    <>
      <path d="M8 10.5V2.8M8 2.8 5 5.8M8 2.8l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.6 10.6v1.4a1.4 1.4 0 0 0 1.4 1.4h8a1.4 1.4 0 0 0 1.4-1.4v-1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  scan: (
    <>
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  chain: (
    <>
      <rect x="1.8" y="1.8" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7.2" y="7.2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 4.3h1.8a1.4 1.4 0 0 1 1.4 1.4v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  report: (
    <>
      <path d="M3.2 2.4h6.1l3.5 3.5v7.7a.6.6 0 0 1-.6.6H3.2a.6.6 0 0 1-.6-.6V3a.6.6 0 0 1 .6-.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 2.6v3.4h3.4M5 9h5M5 11.2h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  shield: (
    <>
      <path d="M8 2 3.2 3.9v3.6c0 2.8 1.9 5.2 4.8 6.5 2.9-1.3 4.8-3.7 4.8-6.5V3.9L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m5.9 8 1.5 1.5 2.9-2.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  users: (
    <>
      <circle cx="6.1" cy="5.6" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 13.2a4.1 4.1 0 0 1 8.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.6 3.5a2.4 2.4 0 0 1 0 4.4M11.4 9.6a4.1 4.1 0 0 1 2.6 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  bell: (
    <>
      <path d="M4 6.6a4 4 0 0 1 8 0c0 2.4.7 3.6 1.2 4.2H2.8C3.3 10.2 4 9 4 6.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.6 13a1.6 1.6 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.3 10.3 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
};

/** Stroke icon on a 16px grid. `FEATURES` names these by string. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const FOOTER_GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/solutions", label: "Solutions" },
      { href: "/pricing", label: "Pricing" },
      { href: "/customers", label: "Customers" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/faq", label: "FAQ" },
      { href: "/blog", label: "Blog" },
      { href: "/status", label: "Status" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/security", label: "Security" },
      { href: "/compliance", label: "Compliance" },
      { href: "/subprocessors", label: "Subprocessors" },
      { href: "/dpa", label: "DPA" },
      { href: "/responsible-disclosure", label: "Responsible disclosure" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/cookies", label: "Cookie Policy" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-hairline bg-paper-raised">
      <div className="section py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
          <div className="max-w-xs">
            <Link href="/" className="inline-flex" aria-label="SiroQ home">
              <BrandLogo height={26} />
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              An auditable review workspace for pharmacy dispensing records. Every filing keeps a
              visible chain of custody from upload to signed-off result.
            </p>
            <p className="mt-4 font-mono text-[11px] text-muted">
              Built for dispensing data, reviewed by people who have to sign for it.
            </p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[13px] font-medium text-ink">{group.title}</p>
              <ul className="mt-3 space-y-2 text-[13px] text-muted">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link className="transition-colors hover:text-ink" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SiroQ. All rights reserved.</p>
          <p className="font-mono text-[11px]">
            Tenant-scoped by default · every status change is an audit event
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Page header for interior pages: breadcrumb-free, single column, no hero art. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="section pb-12 pt-14 sm:pt-20">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <div className="signature-rule mt-6" />
      {lede ? <div className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted">{lede}</div> : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </header>
  );
}

/** Section heading with an optional supporting line. */
export function SectionHead({
  eyebrow,
  title,
  lede,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h2>
      {lede ? <p className="mt-4 text-[15px] leading-relaxed text-muted">{lede}</p> : null}
    </div>
  );
}

/** Bordered panel used for feature and role cards. */
export function Panel({
  title,
  description,
  icon,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-6 ${className}`}>
      {icon ? (
        <div
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent-strong"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p> : null}
      {children ? <div className="mt-4 text-[13px] leading-relaxed text-muted">{children}</div> : null}
    </div>
  );
}

/** Call to action band. `tone="dark"` is the one inverted surface on the site. */
export function CtaBand({
  title,
  body,
  primary = { href: "/contact", label: "Request access" },
  secondary,
  tone = "dark",
}: {
  title: string;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <section className="section py-16">
      <div
        className={
          dark
            ? "relative overflow-hidden rounded-card bg-[linear-gradient(140deg,var(--brand-ink),var(--brand-deep))] px-8 py-14 text-white"
            : "card px-8 py-14"
        }
      >
        {dark ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.09),transparent)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(201,122,61,0.22),transparent)]"
            />
          </>
        ) : null}

        <div className="relative max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h2>
          <p className={`mt-4 text-[15px] leading-relaxed ${dark ? "text-white/75" : "text-muted"}`}>
            {body}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={primary.href}
              className={
                dark
                  ? "rounded-[10px] bg-white px-5 py-2.5 text-sm font-medium text-[var(--brand-ink)] shadow-soft transition-all hover:brightness-95"
                  : "rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-sm font-medium text-white shadow-soft"
              }
            >
              {primary.label}
            </Link>
            {secondary ? (
              <Link
                href={secondary.href}
                className={
                  dark
                    ? "rounded-[10px] border border-white/25 px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/10"
                    : "rounded-[10px] border border-hairline px-5 py-2.5 text-sm text-ink transition-colors hover:border-accent"
                }
              >
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Disclosure list. Built on native `<details>` so it works before hydration and
 * stays usable if the script never loads — the FAQ is the page most likely to be
 * read on a slow connection.
 */
export function DisclosureList({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="divide-y divide-hairline border-y border-hairline">
      {items.map((item) => (
        <details key={item.q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[15px] font-medium text-ink marker:hidden">
            {item.q}
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-45"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <div className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/** Key/value figure, used in spec strips. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="stat-figure mt-1.5">{value}</p>
    </div>
  );
}
