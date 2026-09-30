import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";

/**
 * Stat module card. Quiet numbered card with an optional inline
 * sparkline; `featured` promotes it to a dark accent tile for the
 * bento dashboard treatment.
 */
export function StatModule({
  label,
  value,
  sub,
  trend,
  featured = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: number[];
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border px-5 py-5 shadow-soft transition-shadow duration-200 hover:shadow",
        featured
          ? "border-transparent bg-[linear-gradient(150deg,#11302d,#1f5650)] text-[var(--on-brand)] hover:shadow-lift"
          : "border-hairline/70 bg-paper-raised",
        className,
      )}
    >
      <p
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.1em]",
          featured ? "text-[var(--on-brand-muted)]" : "text-muted",
        )}
      >
        {label}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="stat-figure">{value}</span>
        {trend ? (
          <Sparkline
            points={trend}
            className={featured ? "text-[var(--on-brand-muted)]" : "text-accent"}
          />
        ) : null}
      </div>
      {sub ? (
        <p className={cn("mt-1.5 text-xs", featured ? "text-[var(--on-brand-muted)]/90" : "text-muted")}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Responsive strip of StatModule cards (1 / 2 / 4 columns). */
export function StatStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}