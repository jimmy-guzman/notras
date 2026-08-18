import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export function setNoteTags(path: string, tags: string[]) {
  const normalized = [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
    ),
  ];

  return run(NoteService.use((svc) => svc.setTags(path, normalized)));
}
