import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

/**
 * Shared frame for the three states that must render *without* a valid session
 * or a reachable backend: maintenance, access denied, session expired.
 *
 * They deliberately live in their own route group rather than inside the
 * authenticated shell. A page that explains "your session ended" cannot itself
 * require a session, or the explanation is unreachable in exactly the case it
 * exists for.
 */
export function SystemStateCard({
  eyebrow,
  title,
  children,
  icon: Icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  icon: LucideIcon;
  actions: { href: string; label: string; variant?: "default" | "outline" | "ghost" }[];
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <BrandLogo height={24} />
        </div>

        <div className="mt-8 rounded-card border border-hairline bg-paper-raised px-6 py-8 text-left shadow-soft">
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {eyebrow}
              </p>
              <h1 className="mt-1.5 text-lg font-semibold leading-snug text-ink">{title}</h1>
              <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-hairline pt-5">
            {actions.map((action) => (
              <Button key={action.href} asChild size="sm" variant={action.variant ?? "outline"}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Questions about this state? Use the{" "}
          <Link href="/contact" className="underline underline-offset-2 hover:text-ink">
            contact form
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
