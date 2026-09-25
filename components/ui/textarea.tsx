import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[64px] w-full rounded-stamp border border-hairline bg-paper-raised px-3 py-2 text-sm text-ink shadow-[0_1px_2px_rgba(22,48,46,0.05)] placeholder:text-[#8b9a97] hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };