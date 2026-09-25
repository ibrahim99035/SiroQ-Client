"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-[var(--status-rejected-fill)]" aria-hidden="true" />
      <p className="mt-4 font-mono text-[12px] uppercase tracking-wider text-muted">system fault</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">
        This screen failed to load. Your data is intact.
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        {error.message || "An unexpected runtime error occurred."} Retry to re-render the screen; if
        it persists, the data layer may be exercising its simulated fault.
      </p>
      <div className="mt-6">
        <Button onClick={reset}>Retry</Button>
      </div>
    </main>
  );
}