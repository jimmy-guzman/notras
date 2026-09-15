import { toast } from "@/components/ui/toast";
import { changeNoteMetadata } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";

/** Both tag controls edit the session's document through this. */
export async function changeNoteTags(
  path: string,
  update: (current: string[]) => string[]
) {
  try {
    await changeNoteMetadata(path, { tags: update });
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not update tags",
      type: "error",
    });
  }
}
