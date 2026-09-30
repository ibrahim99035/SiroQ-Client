"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary.
 *
 * Two things it deliberately does not do:
 *
 *  - It does not render `error.message` into the page. A server-side error string
 *    can carry internals, and this boundary covers the whole app including
 *    authenticated routes. The digest is shown instead, because that is the
 *    identifier an administrator needs to find the entry in the logs.
 *  - It does not retry automatically. A silent retry loop hides a persistent
 *    fault behind a page that occasionally renders, which is worse than a
 *    visible failure.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side console so the failure is visible during local development and
    // in a browser console on a deployed instance.
    console.error("[app] unhandled error boundary:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <AlertTriangle
        className="h-8 w-8 text-[var(--status-rejected-fill)]"
        aria-hidden="true"
      />
      <p className="mt-4 font-mono text-[12px] uppercase tracking-wider text-muted">
        system fault
      </p>
      <h1 className="mt-2 max-w-lg text-2xl font-semibold leading-tight text-ink">
        This screen could not be rendered. Your data is intact.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        Nothing was lost. The failure happened while drawing this screen, after your request was
        handled. Retrying usually works; if it does not, the fault is on the server.
      </p>

      {error.digest ? (
        <p className="mt-5 font-mono text-[11px] text-muted">
          Reference for support: <span className="text-ink">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
