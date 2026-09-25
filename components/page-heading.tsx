import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page heading with the signature warm rule. The rule is the one warm
 * moment for bread-and-butter screens; screens that own a stronger warm
 * moment (timeline current step) pass `rule="hairline"` instead so each
 * screen keeps exactly one warm accent.
 */
export function PageHeading({
  title,
  description,
  eyebrow,
  children,
  rule = "warm",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  rule?: "warm" | "hairline";
  className?: string;
}) {
  return (
    <div className={cn("pt-2", className)}>
      {eyebrow ? (
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      <div className={cn("signature-rule", rule === "hairline" && "signature-rule-muted")} />
      {description ? <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p> : null}
    </div>
  );
}