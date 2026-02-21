"use client";

import type * as React from "react";

import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "@/lib/ui/utils";

function Separator({
  className,
  decorative = true,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      className={cn(
        "bg-border shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      {...props}
    />
  );
}

export { Separator };
