import { FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <FileWarning className="h-8 w-8 text-accent" aria-hidden="true" />
      <p className="mt-4 font-mono text-[12px] uppercase tracking-wider text-muted">404 — no such field</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">
        The page you are looking for is not in the registry.
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        This address does not exist on this preview. Return to the dashboard or a known section.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild variant="outline">
          <a href="/login">Back to sign in</a>
        </Button>
        <Button asChild>
          <a href="/">Home</a>
        </Button>
      </div>
    </main>
  );
}