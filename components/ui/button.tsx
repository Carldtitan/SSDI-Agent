import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "quiet";
type ButtonSize = "default" | "small" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white shadow-[0_1px_0_oklch(0_0_0/0.12),0_8px_24px_oklch(0.46_0.145_356.8/0.16)] hover:bg-primary-hover active:translate-y-px",
  secondary:
    "border border-border bg-surface text-foreground hover:border-primary/35 hover:bg-primary-soft/55",
  quiet: "text-muted hover:bg-surface-subtle hover:text-foreground",
};

const sizes: Record<ButtonSize, string> = {
  default: "min-h-12 px-5 py-2.5",
  small: "min-h-10 px-3.5 py-2 text-sm",
  icon: "size-11 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  asChild = false,
  className,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] font-bold transition-[background-color,border-color,color,transform,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}
