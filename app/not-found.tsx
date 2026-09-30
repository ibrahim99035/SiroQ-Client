import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

/**
 * Root 404.
 *
 * Sits outside the marketing layout, so it cannot assume a nav or footer. It
 * offers the three destinations that actually help someone who arrived on a bad
 * link: the site root, the filing index, and sign-in.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <BrandLogo height={26} />

      <FileQuestion className="mt-10 h-8 w-8 text-accent" aria-hidden="true" />
      <p className="mt-4 font-mono text-[12px] uppercase tracking-wider text-muted">
        404 — not in the register
      </p>
      <h1 className="mt-2 max-w-lg text-2xl font-semibold leading-tight text-ink">
        There is nothing at this address.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        The page may have been renamed, or the link may have been truncated. If you followed a link
        from an email, the filing it referred to may have moved.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Go to the homepage</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/applications">Go to filings</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>

      <p className="mt-10 max-w-md text-xs leading-relaxed text-muted">
        If you expected a filing here, search by its reference instead — references look like
        AP-2026-0142 and are unique.
      </p>
    </main>
  );
}
