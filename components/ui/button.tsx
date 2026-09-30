import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-stamp text-[13px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] text-white shadow-soft hover:shadow hover:brightness-[1.07]",
        warm: "bg-[linear-gradient(180deg,var(--accent-warm-top),var(--accent-warm-strong))] text-white shadow-soft hover:shadow hover:brightness-[1.05]",
        secondary:
          "bg-accent-muted text-ink hover:bg-[var(--accent-muted-hover)]",
        outline:
          "border border-hairline bg-paper-raised text-ink shadow-soft hover:border-accent hover:text-accent",
        ghost: "text-muted hover:bg-accent-soft hover:text-ink",
        destructive:
          "bg-[linear-gradient(180deg,var(--danger-top),var(--status-rejected-fill))] text-white shadow-soft hover:shadow hover:brightness-[1.05]",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };