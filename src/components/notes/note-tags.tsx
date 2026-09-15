import { useQuery } from "@tanstack/react-query";
import { HashIcon, TagPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useNoteTags } from "@/components/notes/use-note-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { noteQueries } from "@/data/queries";
import { reasonOf } from "@/lib/ui/failure";
import { useHotkey } from "@/lib/ui/shortcuts";

interface TagBadgeProps {
  onFilter: (tag: string) => void;
  tag: string;
}

function TagBadge({ onFilter, tag }: TagBadgeProps) {
  const filter = useCallback(() => {
    onFilter(tag);
  }, [onFilter, tag]);

  return (
    <Badge
      className="text-muted-foreground hover:text-foreground outline-none"
      render={<button aria-label={`#${tag}`} onClick={filter} type="button" />}
      variant="ghost"
    >
      {`#${tag}`}
    </Badge>
  );
}

interface NoteTagsProps {
  onFilter: (tag: string) => void;
  path: string;
  tags: string[];
}

export function NoteTags({ onFilter, path, tags }: NoteTagsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const allTags = useQuery({ ...noteQueries.tags(), enabled: open });
  const { changeTags, tags: optimisticTags } = useNoteTags(path, tags);

  useHotkey(
    "Mod+Shift+Y",
    () => {
      setOpen(true);
    },
    { meta: { name: "edit tags" } }
  );

  const counts = new Map(allTags.data?.map(({ count, tag }) => [tag, count]));

  // A tag the note carries may not be in the index yet, and the typed draft is
  // the "create" row. Both are the same kind of string an existing tag is, so
  // selecting either one just adds it.
  const draft = query.trim().toLowerCase();
  const items = [
    ...new Set([
      ...counts.keys(),
      ...optimisticTags,
      ...(draft === "" ? [] : [draft]),
    ]),
  ].toSorted();

  // Clearing the input belongs to this surface rather than to the write, so it
  // wraps the shared writer instead of living inside it.
  const commitTags = useCallback(
    (nextTags: string[]) => {
      setQuery("");
      // The combobox reports a replacement for its rendered value, so recover the toggled items here.
      const toggled = new Set(nextTags).symmetricDifference(
        new Set(optimisticTags)
      );
      void changeTags((current) => [
        ...new Set(current).symmetricDifference(toggled),
      ]);
    },
    [changeTags, optimisticTags]
  );

  const retry = useCallback(async () => {
    await allTags.refetch();
  }, [allTags]);
  const hasTags = optimisticTags.length > 0;

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {hasTags ? (
        // The focus ring is a shadow outside a chip's box, and the clip lands
        // on the padding edge, so padding cancelled by a margin gives the ring
        // its room without moving a chip.
        <div className="-m-1 flex min-w-0 items-center gap-0.5 overflow-hidden p-1">
          {optimisticTags.map((tag) => (
            <TagBadge key={tag} onFilter={onFilter} tag={tag} />
          ))}
        </div>
      ) : null}
      <Combobox
        inputValue={query}
        items={items}
        multiple
        onInputValueChange={setQuery}
        onOpenChange={setOpen}
        onValueChange={commitTags}
        open={open}
        value={optimisticTags}
      >
        <ComboboxTrigger
          aria-label="add tag"
          className="[&>svg:last-child]:hidden"
          render={
            <Badge
              className="text-muted-foreground hover:text-foreground outline-none"
              render={<button aria-label="add tag" type="button" />}
              variant="ghost"
            />
          }
        >
          <TagPlusIcon data-icon="inline-start" />
          add tag
        </ComboboxTrigger>
        <ComboboxContent
          align="start"
          className="border-border w-56 min-w-56 border shadow-[0_8px_24px_rgb(0_0_0/0.18)] ring-0"
          side="top"
        >
          <ComboboxInput placeholder="filter tags..." showTrigger={false} />
          {allTags.data === undefined && allTags.isPending ? (
            <output className="text-muted-foreground block px-3 py-2 text-xs">
              loading tag suggestions...
            </output>
          ) : null}
          {allTags.isError ? (
            <output className="block px-3 py-2 text-xs">
              <span className="block">could not load tag suggestions</span>
              <span className="block">{reasonOf(allTags.error)}</span>
              <Button
                onClick={() => {
                  void retry();
                }}
                size="sm"
                variant="ghost"
              >
                retry
              </Button>
            </output>
          ) : null}
          {allTags.isSuccess ? (
            <ComboboxEmpty className="flex-col gap-0.5">
              <p className="text-muted-foreground">no tags yet</p>
              <p className="text-faint">type to create one</p>
            </ComboboxEmpty>
          ) : null}
          <ComboboxList>
            {(tag: string) => (
              <ComboboxItem key={tag} value={tag}>
                <HashIcon className="text-muted-foreground" />
                <span className="truncate">{tag}</span>
                <span className="text-faint ml-auto">
                  {counts.get(tag) ?? (allTags.data === undefined ? "" : "new")}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
