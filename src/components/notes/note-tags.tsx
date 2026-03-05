import Link from "next/link";

import type { SelectTag } from "@/server/db/schemas/tags";

import { Badge } from "@/components/ui/badge";

const DEFAULT_MAX_VISIBLE = 3;

interface NoteTagsProps {
  currentParams?: { folder?: string; q?: string; tag?: string; time?: string };
  maxVisible?: number;
  tags: SelectTag[];
}

export const NoteTags = ({
  currentParams,
  maxVisible = DEFAULT_MAX_VISIBLE,
  tags,
}: NoteTagsProps) => {
  if (tags.length === 0) return null;

  const visible = tags.slice(0, maxVisible);
  const overflow = tags.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => {
        const params = new URLSearchParams({ tag: t.name });

        if (currentParams?.folder) params.set("folder", currentParams.folder);

        if (currentParams?.q) params.set("q", currentParams.q);

        if (currentParams?.time && currentParams.time !== "all") {
          params.set("time", currentParams.time);
        }

        return (
          <Link href={`/notes?${params.toString()}`} key={t.id}>
            <Badge
              className="cursor-pointer hover:opacity-80"
              variant="secondary"
            >
              {t.name}
            </Badge>
          </Link>
        );
      })}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">{`+${String(overflow)}`}</span>
      )}
    </div>
  );
};
