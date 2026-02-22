import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { Separator } from "@/components/ui/separator";
import { truncate } from "@/lib/utils/truncate";

const MAX_CONTENT_LENGTH = 80;

export function RecentNotes({ notes }: { notes: SelectNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="w-full max-w-xl">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Recent Notes
      </h2>
      <ul>
        {notes.map((n, index) => {
          return (
            <li key={n.id}>
              {index > 0 && <Separator />}
              <Link
                className="block truncate py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                href={`/notes/${n.id}`}
              >
                {truncate(n.content, MAX_CONTENT_LENGTH)}
              </Link>
            </li>
          );
        })}
      </ul>
      <Separator />
      <div className="pt-2 text-center">
        <Link
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          href="/notes"
        >
          View all notes
        </Link>
      </div>
    </div>
  );
}
