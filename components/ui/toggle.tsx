"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed, onPressedChange, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onPressedChange?.(!pressed);
      props.onClick?.(e);
    };
    return (
      <button
        ref={ref}
        type="button"
        data-state={pressed ? "on" : "off"}
        aria-pressed={pressed}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-stamp text-[13px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
          pressed
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-accent-soft hover:text-ink",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Toggle.displayName = "Toggle";

export { Toggle };
