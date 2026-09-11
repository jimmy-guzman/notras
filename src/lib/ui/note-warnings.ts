import { toast } from "@/components/ui/toast";
import type { MutationWarning } from "@/server/adapters/bindings";

/** Committed changes remain saved; these warnings describe the work left afterward. */
export function reportNoteWarnings(warnings: MutationWarning[]): void {
  for (const warning of warnings) {
    toast.add({
      description: `${warning.path}: ${warning.message}`,
      id: `${warning.kind}:${warning.path}`,
      timeout: 0,
      title:
        warning.kind === "index"
          ? "could not update search"
          : "could not remove the original note",
      type: "warning",
    });
  }
}
