import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { changeNoteMetadata } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";

/** Both tag controls read and edit the session's document. */
export function useNoteTags(path: string, tags: string[]) {
  const changeTags = useCallback(
    async (nextTags: string[]) => {
      try {
        await changeNoteMetadata(path, { tags: nextTags });
      } catch (error) {
        toast.add({
          description: reasonOf(error),
          title: "could not update tags",
          type: "error",
        });
      }
    },
    [path]
  );
  return { changeTags, tags };
}
