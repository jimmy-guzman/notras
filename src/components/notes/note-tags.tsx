import { HashIcon, TagPlusIcon } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

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
  const { changeTags, tags: optimisticTags } = useNoteTags(path, tags);

  useHotkeys(
    "mod+shift+t",
    () => {
      setOpen(true);
    },
    HOTKEY_OPTIONS
  );

  const counts = new Map(allTags.map(({ count, tag }) => [tag, count]));

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
  const commitTags = (nextTags: string[]) => {
    setQuery("");
    changeTags(nextTags);
  };

  const hasTags = optimisticTags.length > 0;

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      {hasTags ? (
        <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
          {optimisticTags.map((tag) => (
            <Badge
              className="text-muted-foreground hover:text-foreground"
              key={tag}
              render={
                <button
                  onClick={() => {
                    onFilter(tag);
                  }}
                  type="button"
                />
              }
              variant="ghost"
            >
              {`#${tag}`}
            </Badge>
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
            {(tag: string) => (
              <ComboboxItem key={tag} value={tag}>
                <HashIcon className="text-muted-foreground" />
                <span className="truncate">{tag}</span>
                <span className="ml-auto text-faint">
                  {counts.get(tag) ?? "new"}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
