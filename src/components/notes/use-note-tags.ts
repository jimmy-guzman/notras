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

  // The loader's tags are the last set known to be on disk, so they are what a
  // failed write falls back to. Held in a ref because the write resolves long
  // after the render that started it.
  const savedRef = useRef(tags);

  useEffect(() => {
    savedRef.current = tags;
  });

  const queueRef = useRef(Promise.resolve());
  const latestRef = useRef(0);

  // Writing tags is a read-modify-write of the file (`NoteService.setTags`), so
  // two in flight can land in either order and leave disk holding the older
  // set. Chaining them makes the last call the last write.
  const changeTags = (nextTags: string[]) => {
    const request = latestRef.current + 1;

    latestRef.current = request;
    setOptimisticTags(nextTags);

    queueRef.current = queueRef.current.then(async () => {
      try {
        await setNoteTags(path, nextTags);
      } catch {
        // Only the newest change owns what is displayed. An older failure must
        // not restore a set the user has already moved past, and must not
        // report a failure they have already superseded.
        if (latestRef.current === request) {
          setOptimisticTags(savedRef.current);
          toast.add({ title: "could not update tags", type: "error" });
        }
      }
    });

    return queueRef.current;
  };

  return { changeTags, tags: optimisticTags };
}
