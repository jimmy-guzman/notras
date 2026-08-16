import { HashIcon, TagPlusIcon } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

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
import { setNoteTags } from "@/data/set-note-tags";

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

interface NoteTagsProps {
  allTags: { count: number; tag: string }[];
  onFilter: (tag: string) => void;
  path: string;
  tags: string[];
}

export function NoteTags({ allTags, onFilter, path, tags }: NoteTagsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  useHotkeys(
    "mod+shift+t",
    () => {
      setOpen(true);
    },
    HOTKEY_OPTIONS,
  );

  const counts = new Map(
    allTags.map(({ count, tag }) => {
      return [tag, count];
    }),
  );

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

  const changeTags = async (nextTags: string[]) => {
    const previous = optimisticTags;

    setOptimisticTags(nextTags);
    setQuery("");

    try {
      await setNoteTags(path, nextTags);
    } catch {
      setOptimisticTags(previous);
      toast.error("could not update tags");
    }
  };

  const hasTags = optimisticTags.length > 0;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {hasTags ? (
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {optimisticTags.map((tag) => {
            return (
              <Button
                className="text-muted-foreground hover:text-foreground"
                key={tag}
                onClick={() => {
                  onFilter(tag);
                }}
                size="xs"
                variant="ghost"
              >
                {`#${tag}`}
              </Button>
            );
          })}
        </div>
      ) : null}
      <Combobox
        inputValue={query}
        items={items}
        multiple
        onInputValueChange={setQuery}
        onOpenChange={setOpen}
        onValueChange={changeTags}
        open={open}
        value={optimisticTags}
      >
        <ComboboxTrigger
          className="[&>svg:last-child]:hidden"
          render={<Button size="xs" variant="ghost" />}
        >
          <TagPlusIcon />
          add tag
        </ComboboxTrigger>
        <ComboboxContent
          align="start"
          className="w-56 min-w-56 border border-border shadow-[0_8px_24px_rgb(0_0_0/0.18)] ring-0"
          side="top"
        >
          <ComboboxInput placeholder="filter tags..." showTrigger={false} />
          <ComboboxEmpty className="flex-col gap-0.5">
            <p className="text-muted-foreground">no tags yet</p>
            <p className="text-faint">type to create one</p>
          </ComboboxEmpty>
          <ComboboxList>
            {(tag: string) => {
              return (
                <ComboboxItem key={tag} value={tag}>
                  <HashIcon className="text-muted-foreground" />
                  <span className="truncate">{tag}</span>
                  <span className="ml-auto text-faint">
                    {counts.get(tag) ?? "new"}
                  </span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
