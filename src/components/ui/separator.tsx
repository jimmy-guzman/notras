import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";

/**
 * A vertical separator is etched: a shadow line with a highlight beside it,
 * which reads as a dent in the bar where a single line between icon buttons
 * reads as one more glyph.
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "data-horizontal:bg-input data-vertical:bg-groove data-vertical:shadow-groove shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:h-4 data-vertical:w-px",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
