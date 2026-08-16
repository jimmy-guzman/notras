import { useState } from "react";
import { toast } from "sonner";

import { setNoteTags } from "@/data/set-note-tags";

/**
 * A note's tags with an optimistic write.
 *
 * Shared by every surface that edits tags, so a rollback or a sync rule is
 * fixed once rather than per surface (`D31`).
 */
export function useNoteTags(path: string, tags: string[]) {
  const [optimisticTags, setOptimisticTags] = useState(tags);

  // Optimistic state follows the loader (adjust-during-render pattern): an
  // agent editing the frontmatter on disk must show up here instead of being
  // stuck on whatever we last set ourselves. Compared by value -- the loader
  // hands back a fresh array every refresh.
  const tagsKey = tags.join("\n");
  const [syncedTags, setSyncedTags] = useState(tagsKey);

  if (syncedTags !== tagsKey) {
    setSyncedTags(tagsKey);
    setOptimisticTags(tags);
  }

  const changeTags = async (nextTags: string[]) => {
    const previous = optimisticTags;

    setOptimisticTags(nextTags);

    try {
      await setNoteTags(path, nextTags);
    } catch {
      setOptimisticTags(previous);
      toast.error("could not update tags");
    }
  };

  return { changeTags, tags: optimisticTags };
}
