"use client";

import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cva } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";

import { cn } from "@/lib/ui/utils";

const toggleVariants = cva(
  "hover:text-foreground aria-pressed:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive gap-1 rounded-4xl text-sm font-medium transition-colors [&_svg:not([class*='size-'])]:size-4 group/toggle hover:bg-muted inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 min-w-9 rounded-[min(var(--radius-2xl),12px)] px-2.5",
        lg: "h-10 min-w-10 px-2.5",
        sm: "h-8 min-w-8 px-3",
      },
      variant: {
        default: "bg-transparent",
        outline: "border-input hover:bg-muted border bg-transparent",
      },
    },
  },
);

function Toggle({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      className={cn(toggleVariants({ className, size, variant }))}
      data-slot="toggle"
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
