import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import { setNoteTags } from "@/data/set-note-tags";

/**
 * A note's tags with an optimistic write.
 *
 * Shared by every surface that edits tags, so a rollback or a sync rule is
 * fixed once rather than per surface (`D31`).
 */
export function useNoteTags(path: string, tags: string[]) {
  const queryClient = useQueryClient();
  const mutationKey = ["note-tags", path];
  const [optimisticTags, setOptimisticTags] = useState(tags);

  // Optimistic state follows the file (adjust-during-render pattern): an agent
  // editing the frontmatter on disk has to show up here rather than leaving
  // the row stuck on whatever we last set. Compared by value, since every
  // re-read hands back a fresh array.
  const tagsKey = tags.join("\n");
  const [syncedTags, setSyncedTags] = useState(tagsKey);

  if (syncedTags !== tagsKey) {
    setSyncedTags(tagsKey);
    setOptimisticTags(tags);
  }

  // A path change resets the observer, and a mutation already in flight keeps
  // the options it held then. Restoring from the callback's own `tags` would
  // put the previous note's set onto the one now showing.
  const savedTags = useRef(tags);

  useEffect(() => {
    savedTags.current = tags;
  });

  const { mutate: changeTags } = useMutation({
    mutationFn: (nextTags: string[]) => setNoteTags(path, nextTags),
    mutationKey,
    onError: () => {
      // This one still counts as pending here, so anything above one is a
      // later toggle queued behind it, which will decide the display itself.
      // An older failure must not restore a set the user moved past (`D31`).
      if (queryClient.isMutating({ mutationKey }) > 1) {
        return;
      }

      setOptimisticTags(savedTags.current);
      toast.add({ title: "could not update tags", type: "error" });
    },
    onMutate: (nextTags: string[]) => {
      setOptimisticTags(nextTags);
    },
    // `NoteService.setTags` is a read-modify-write of the file, so two in
    // flight could land in either order. The scope is the note rather than the
    // hook, so the two surfaces `D31` allows serialize against each other too.
    scope: { id: path },
  });

  return { changeTags, tags: optimisticTags };
}
