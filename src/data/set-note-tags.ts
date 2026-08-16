import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function setNoteTags(path: string, tags: string[]) {
  const normalized = [
    ...new Set(
      tags
        .map((tag) => {
          return tag.trim().toLowerCase();
        })
        .filter((tag) => {
          return tag.length > 0;
        }),
    ),
  ];

  return run(
    NoteService.use((svc) => {
      return svc.setTags(path, normalized);
    }),
  );
}
