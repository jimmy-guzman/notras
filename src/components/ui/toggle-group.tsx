"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "cn";
import * as React from "react";

import { Toggle } from "@/components/ui/toggle";
import type { ToggleProps } from "@/components/ui/toggle";

type GroupVariants = Pick<ToggleProps, "size" | "variant"> & {
  orientation?: "horizontal" | "vertical";
  spacing?: number;
};

const ToggleGroupContext = React.createContext<GroupVariants>({
  orientation: "horizontal",
  size: "default",
  spacing: 2,
  variant: "default",
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props & GroupVariants) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing }}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-vertical:flex-col data-vertical:items-stretch data-[size=sm]:rounded-[min(var(--radius-md),10px)]",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        // oxlint-disable-next-line react/jsx-no-constructed-context-values -- the React Compiler caches this object; useMemo would restate it
        value={{ orientation, size, spacing, variant }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: ToggleProps) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <Toggle
      data-slot="toggle-group-item"
      data-variant={context.variant ?? variant}
      data-size={context.size ?? size}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        className
      )}
      size={context.size ?? size}
      variant={context.variant ?? variant}
      {...props}
    >
      {children}
    </Toggle>
  );
}

export { ToggleGroup, ToggleGroupItem };
