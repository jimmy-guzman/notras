import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"output">) {
  return (
    <output
      aria-label="loading"
      data-slot="spinner"
      className={cn("inline-flex", className)}
      {...props}
    >
      <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
    </output>
  );
}

export { Spinner };
