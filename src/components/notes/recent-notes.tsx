import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { truncate } from "@/lib/utils/truncate";

const formatDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const MAX_CONTENT_LENGTH = 80;

export function RecentNotes({ notes }: { notes: SelectNote[] }) {
  if (notes.length === 0) return null;

  return (
    <section className="w-full max-w-xl">
      <h2 className="text-muted-foreground mb-3 text-sm font-medium">
        Recent Notes
      </h2>
      <Card className="gap-0 py-0" size="sm">
        {notes.map((n, index) => {
          return (
            <div key={n.id}>
              {index > 0 && <Separator />}
              <Link
                className="hover:bg-muted/50 focus-visible:ring-ring rounded-inherit block px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                href={`/notes/${n.id}`}
              >
                <CardContent className="p-0">
                  <p className="text-foreground text-sm leading-relaxed">
                    {truncate(n.content, MAX_CONTENT_LENGTH)}
                  </p>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {formatDate(n.createdAt)}
                  </span>
                </CardContent>
              </Link>
            </div>
          );
        })}
      </Card>
      <div className="mt-3 text-center">
        <Link
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 transition-colors hover:underline"
          href="/notes"
        >
          View all notes
        </Link>
      </div>
    </section>
  );
}
