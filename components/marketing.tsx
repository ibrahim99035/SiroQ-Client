import Link from "next/link";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline/80 bg-paper/70 shadow-[0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
            <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">Requis</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm text-muted sm:flex" aria-label="Sections">
          <Link className="rounded-[8px] px-1.5 py-1 transition-colors hover:bg-accent-soft hover:text-ink" href="/#process">
            Process
          </Link>
          <Link className="rounded-[8px] px-1.5 py-1 transition-colors hover:bg-accent-soft hover:text-ink" href="/#roles">
            Roles
          </Link>
          <Link className="rounded-[8px] px-1.5 py-1 transition-colors hover:bg-accent-soft hover:text-ink" href="/pricing">
            Pricing
          </Link>
          <Link className="rounded-[8px] px-1.5 py-1 transition-colors hover:bg-accent-soft hover:text-ink" href="/terms">
            Terms
          </Link>
          <Link className="rounded-[8px] px-1.5 py-1 transition-colors hover:bg-accent-soft hover:text-ink" href="/privacy">
            Privacy
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-[10px] px-3 py-2 text-sm text-ink transition-colors hover:bg-accent-soft"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-3.5 py-2 text-sm font-medium text-white shadow-soft transition-all hover:shadow hover:brightness-[1.07]"
          >
            Start preview
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-stamp bg-accent" aria-hidden="true">
                <span className="h-2 w-2 rounded-[2px] border-2 border-white" />
              </span>
              <span className="text-[15px] font-semibold text-ink">Requis</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A multi-tenant review workspace for pharmacy application filings: accounts, tenant
              isolation, private file storage, and an auditable review lifecycle.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
            <div>
              <p className="font-medium text-ink">Product</p>
              <ul className="mt-3 space-y-2 text-muted">
                <li>
                  <Link className="transition-colors hover:text-ink" href="/#process">Process</Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-ink" href="/#roles">Roles</Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-ink" href="/pricing">Pricing</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-ink">Legal</p>
              <ul className="mt-3 space-y-2 text-muted">
                <li>
                  <Link className="transition-colors hover:text-ink" href="/terms">Terms</Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-ink" href="/privacy">Privacy</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-ink">Demo</p>
              <ul className="mt-3 space-y-2 text-muted">
                <li>
                  <Link className="transition-colors hover:text-ink" href="/login">Sign in</Link>
                </li>
                <li>
                  <Link className="transition-colors hover:text-ink" href="/signup">Create account</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-hairline pt-5 font-mono text-[11px] text-muted">
          Requis · tenant-scoped review workspace · private file storage
        </p>
      </div>
    </footer>
  );
}