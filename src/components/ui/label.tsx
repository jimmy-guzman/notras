import { cn } from "cn";
import type * as React from "react";

function Label({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"label"> & { variant?: "default" | "muted" }) {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor arrives through props, checked at each caller
    <label
      data-slot="label"
      data-variant={variant}
      className={cn(
        "data-[variant=muted]:text-muted-foreground flex items-center gap-2 font-sans text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[variant=muted]:text-xs data-[variant=muted]:font-normal",
        className
      )}
      {...props}
    />
  );
}

export { Label };
