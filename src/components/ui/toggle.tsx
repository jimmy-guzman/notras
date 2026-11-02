import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { cn } from "cn";

const toggleVariants = cva(
  "group/toggle hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:hover:bg-muted/50 dark:aria-invalid:ring-destructive/40 inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        "icon-xs":
          "size-6 rounded-sm border border-transparent bg-clip-padding [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 min-w-6 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default:
          "aria-pressed:bg-muted aria-pressed:text-foreground dark:aria-pressed:bg-muted/50 bg-transparent",
        // A pink line on the edge facing the content marks the pressed one, as the outline marks the heading being read.
        "mark-bottom":
          "aria-pressed:before:bg-primary relative bg-transparent aria-pressed:before:absolute aria-pressed:before:inset-x-1.5 aria-pressed:before:bottom-0 aria-pressed:before:h-0.5 aria-pressed:before:rounded-full forced-colors:aria-pressed:before:bg-[ButtonText]",
        "mark-top":
          "aria-pressed:before:bg-primary relative bg-transparent aria-pressed:before:absolute aria-pressed:before:inset-x-1.5 aria-pressed:before:top-0 aria-pressed:before:h-0.5 aria-pressed:before:rounded-full forced-colors:aria-pressed:before:bg-[ButtonText]",
        outline:
          "border-input hover:bg-muted aria-pressed:bg-muted aria-pressed:text-foreground dark:aria-pressed:bg-muted/50 border bg-transparent",
      },
    },
  }
);

type ToggleProps = TogglePrimitive.Props & VariantProps<typeof toggleVariants>;

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: ToggleProps) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ className, size, variant }))}
      {...props}
    />
  );
}

export { Toggle, type ToggleProps };
