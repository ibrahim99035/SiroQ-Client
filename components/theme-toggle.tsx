"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/components/use-mounted";
import type { Theme } from "@/lib/theme";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies readonly {
  value: Theme;
  label: string;
  Icon: typeof Sun;
}[];

const BUTTON_BASE =
  "inline-flex h-9 items-center justify-center rounded-stamp text-muted transition-colors hover:bg-accent-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Compact light/dark switch for the marketing nav and the app header.
 *
 * Rendered in a fixed "light" state until mount so the server and client HTML
 * agree; `useMounted` then swaps in the real value. `suppressHydrationWarning`
 * on the icon covers the remaining case where the resolved theme differs from
 * the state the server painted.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const mounted = useMounted();
  const next: Theme = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn(BUTTON_BASE, "w-9 shrink-0", className)}
    >
      {mounted && resolved === "dark" ? (
        <Moon className="h-4 w-4" aria-hidden="true" suppressHydrationWarning />
      ) : (
        <Sun className="h-4 w-4" aria-hidden="true" suppressHydrationWarning />
      )}
    </button>
  );
}

/**
 * Three-way light / dark / system control for the settings screen.
 *
 * A `radiogroup` rather than three buttons so arrow keys move between options
 * and screen readers announce the selected state, which a row of toggles would
 * not convey. "System" is what a visitor gets on first visit, so it is the
 * default radio and stays reachable without discovering the icon switch.
 */
export function ThemePreference({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const mounted = useMounted();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-stamp border border-hairline bg-paper-raised p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={cn(
              BUTTON_BASE,
              "h-8 gap-1.5 px-2.5 text-[13px]",
              active && "bg-accent-muted text-ink",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
