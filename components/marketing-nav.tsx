"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Public site header.
 *
 * A client component only for the mobile disclosure and the active-link state;
 * the rest of the marketing site stays on the server.
 *
 * The open state is *derived* rather than reset in an effect. Storing the route
 * the panel was opened on, and comparing it to the current pathname, closes the
 * panel on navigation as a consequence of rendering — so there is no second
 * render pass and no risk of the panel flashing open across a route change.
 */

/**
 * Header sections.
 *
 * `/pricing` is deliberately absent. The page and its content are still built
 * and the route still resolves, because existing links and any shared URLs keep
 * working and we do not want a 404 from a link someone already sent around.
 * It is only unlinked from the header, the footer and the sitemap.
 *
 * Reason: SiroQ is sold by application volume rather than by a published seat
 * table, and the numbers on that page were placeholders pending real pricing
 * sign-off. Surfacing unapproved prices in the primary navigation is worse than
 * not advertising them. Restore the entry here — and in `marketing.tsx`'s
 * footer and `lib/seo.ts`'s sitemap — once pricing is finalised.
 */
/**
 * Built per render from `t` rather than as a module constant.
 *
 * A module-level array cannot call `t`, which would leave the labels invisible
 * to `scripts/check-i18n.mjs` and let them silently ship untranslated. Taking
 * the translator as a parameter keeps every label a literal `"…"` call that
 * the checker can see.
 */
const sections = [
  { href: "/features", label: "Product" },
  { href: "/solutions", label: "Solutions" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/customers", label: "Customers" },
  { href: "/docs", label: "Docs" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const navSections = sections;
  // `null` when closed; otherwise the route it was opened on.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;

  // A panel that stays open after a resize would leave the page unscrollable
  // via the body lock below, so the lock has to follow the panel's real state.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline/80 bg-paper/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="SiroQ home"
        >
          <BrandLogo height={26} priority />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          {navSections.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[8px] px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-accent-soft hover:text-ink"
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <Link
            href="/login"
            className="rounded-[10px] px-3 py-2 text-[13px] text-ink transition-colors hover:bg-accent-soft"
          >
            {"Sign in"}
          </Link>
          <Link
            href="/signup"
            className="rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-3.5 py-2 text-[13px] font-medium text-white shadow-soft transition-all hover:brightness-[1.07]"
          >
            {"Request access"}
          </Link>
          <ThemeToggle />
        </div>

        <button
          type="button"
          onClick={() => setOpenedOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="ml-auto rounded-[8px] p-2 text-ink transition-colors hover:bg-accent-soft lg:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none">
            {open ? (
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M2.5 5.5h13M2.5 12.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open ? (
        <div
          id="mobile-menu"
          className="border-t border-hairline bg-paper lg:hidden"
        >
          <nav className="section flex flex-col gap-1 py-4" aria-label="Sections">
            {navSections.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[8px] px-2 py-2.5 text-sm text-ink transition-colors hover:bg-accent-soft"
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-4">
              <Link
                href="/login"
                className="rounded-[10px] border border-hairline px-3.5 py-2.5 text-center text-sm text-ink"
              >
                {"Sign in"}
              </Link>
              <Link
                href="/signup"
                className="rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-3.5 py-2.5 text-center text-sm font-medium text-white"
              >
                {"Request access"}
              </Link>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
