import { useQuery } from "@tanstack/react-query";
import { HashIcon, TagIcon } from "lucide-react";
import { useState } from "react";

import { Chord } from "@/components/chord";
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
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteQueries } from "@/data/queries";
import { changeNoteMetadata } from "@/lib/tabs/store";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { reasonOf } from "@/lib/ui/failure";
import { useHotkey } from "@/lib/ui/shortcuts";

const EDIT_TAGS = "Mod+Shift+Y";

interface TagBadgeProps {
  onFilter: (tag: string) => void;
  tag: string;
}

function TagBadge({ onFilter, tag }: TagBadgeProps) {
  const filter = () => {
    onFilter(tag);
  };

  return (
    <Badge
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

  useHotkey(
    EDIT_TAGS,
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
    ...new Set([...counts.keys(), ...tags, ...(draft === "" ? [] : [draft])]),
  ].toSorted();

  const commitTags = async (nextTags: string[]) => {
    setQuery("");
    // The combobox reports a replacement for its rendered value, so recover the toggled items here.
    const toggled = new Set(nextTags).symmetricDifference(new Set(tags));
    try {
      await changeNoteMetadata(path, (current) => ({
        tags: [...new Set(current.tags).symmetricDifference(toggled)],
      }));
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update tags",
        type: "error",
      });
    }
  };

  const retry = async () => {
    await allTags.refetch();
  };
  const hasTags = tags.length > 0;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Combobox
        inputValue={query}
        items={items}
        multiple
        onInputValueChange={setQuery}
        onOpenChange={setOpen}
        onValueChange={(value) => {
          void commitTags(value);
        }}
        open={open}
        value={tags}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <ComboboxTrigger
                className="[&>svg:last-child]:hidden"
                render={
                  <Button
                    aria-label="edit tags"
                    size="icon-xs"
                    variant="ghost"
                  />
                }
              />
            }
          >
            <TagIcon className={BAR_GLYPH} />
          </TooltipTrigger>
          <TooltipContent>
            edit tags <Chord hotkey={EDIT_TAGS} />
          </TooltipContent>
        </Tooltip>
        <ComboboxContent
          align="start"
          className="w-56 min-w-56"
          side="top"
          sideOffset={4}
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
            <ComboboxEmpty>
              <p className="text-muted-foreground">no tags yet</p>
              <p className="text-faint">Type to create one</p>
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
      {hasTags ? (
        // The focus ring is a shadow outside a chip's box, and the clip lands
        // on the padding edge, so padding cancelled by a margin gives the ring
        // its room without moving a chip.
        <div className="-m-1 flex min-w-0 items-center gap-1 overflow-hidden p-1">
          {tags.map((tag) => (
            <TagBadge key={tag} onFilter={onFilter} tag={tag} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
