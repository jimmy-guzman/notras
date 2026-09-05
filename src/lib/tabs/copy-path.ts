import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

/**
 * A tab's path onto the clipboard. It reports its own failure so the strip's
 * context menu and the palette cannot drift into two messages for one action.
 */
export async function copyTabPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not copy the path",
      type: "error",
    });
  }
}
