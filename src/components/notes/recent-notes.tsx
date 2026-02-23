import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { truncate } from "@/lib/utils/truncate";

import { AnimatedListItem } from "./animated-list-item";

const MAX_CONTENT_LENGTH = 80;

export function RecentNotes({ notes }: { notes: SelectNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="w-full max-w-xl">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        recent notes
      </h2>
      <ul>
        {notes.map((n, index) => {
          return (
            <AnimatedListItem index={index} key={n.id}>
              {index > 0 && <Separator />}
              <Link
                className="block truncate py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                href={`/notes/${n.id}`}
              >
                {truncate(n.content, MAX_CONTENT_LENGTH)}
              </Link>
            </AnimatedListItem>
          );
        })}
      </ul>
      <Separator />
      <div className="pt-2 text-center">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          href="/notes"
        >
          view all notes
          <Kbd>a</Kbd>
        </Link>
      </div>
    </div>
  );
}
