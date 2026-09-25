"use client";

import { useMounted } from "@/components/use-mounted";
import { relTime } from "@/lib/utils";

/** Relative "3 days ago" that only renders after hydration (stable for SSR). */
export function TimeAgo({ value, className }: { value: string; className?: string }) {
  const mounted = useMounted();
  if (!mounted) return <span className={className}>{value}</span>;
  return <span className={className}>{relTime(value)}</span>;
}