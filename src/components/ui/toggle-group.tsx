"use client";

import type { VariantProps } from "class-variance-authority";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/ui/utils";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    orientation?: "horizontal" | "vertical";
    spacing?: number;
  }
>({
  orientation: "horizontal",
  size: "default",
  spacing: 0,
  variant: "default",
});

ToggleGroupContext.displayName = "ToggleGroupContext";

function ToggleGroup({
  children,
  className,
  orientation = "horizontal",
  size,
  spacing = 0,
  variant,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    orientation?: "horizontal" | "vertical";
    spacing?: number;
  }) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-vertical:flex-col data-vertical:items-stretch data-[spacing=0]:data-[variant=outline]:rounded-4xl",
        className,
      )}
      data-orientation={orientation}
      data-size={size}
      data-slot="toggle-group"
      data-spacing={spacing}
      data-variant={variant}
      style={{ "--gap": spacing } as React.CSSProperties}
      {...props}
    >
      <ToggleGroupContext value={{ orientation, size, spacing, variant }}>
        {children}
      </ToggleGroupContext>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  children,
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.use(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "data-[state=on]:bg-muted shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-3 group-data-[spacing=0]/toggle-group:shadow-none focus:z-10 focus-visible:z-10 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-4xl group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-xl group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-4xl group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-xl group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          size: context.size || size,
          variant: context.variant || variant,
        }),
        className,
      )}
      data-size={context.size || size}
      data-slot="toggle-group-item"
      data-spacing={context.spacing}
      data-variant={context.variant || variant}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
