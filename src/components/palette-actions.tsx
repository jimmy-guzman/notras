import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { array, check, pipe, string } from "valibot";

import { Chord } from "@/components/chord";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { readStored, writeStored } from "@/lib/storage";
import type { useChordsByName } from "@/lib/ui/shortcuts";

/**
 * What an action needs on screen before it is offered. A note action reads
 * frontmatter, so an external file cannot answer it; a tab action acts on the
 * open set, which an external file answers as well as a note does; a file
 * action needs a path on disk, which a draft does not have yet. A filed
 * action needs a note that sits in a folder.
 */
export type PaletteScope =
  | "editor"
  | "file"
  | "filed"
  | "none"
  | "note"
  | "tab";

export interface PaletteAction {
  Icon: LucideIcon;
  label: string;
  needs: PaletteScope;
  onSelect: () => void;
  text: string;
  value: string;
}

interface ActionsViewProps {
  actions: PaletteAction[];
  chordsByName: ReturnType<typeof useChordsByName>;
  query: string;
}

const STORAGE_KEY = "recent-actions";
const RecentActionsSchema = pipe(
  array(string()),
  check((values) => new Set(values).size === values.length)
);

export function ActionsView({
  actions,
  chordsByName,
  query,
}: ActionsViewProps) {
  const [history, setHistory] = useState(
    () =>
      readStored(
        STORAGE_KEY,
        RecentActionsSchema,
        "could not read recent commands"
      ) ?? []
  );
  const recent =
    query.trim() === ""
      ? history
          .flatMap((value) =>
            actions.filter((action) => action.value === value)
          )
          .slice(0, 5)
      : [];
  const recentValues = new Set(recent.map((action) => action.value));
  const groups = [
    { actions: recent, heading: "recent" },
    {
      actions: actions.filter((action) => !recentValues.has(action.value)),
      heading: "actions",
    },
  ];

  return (
    <>
      <CommandEmpty>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>nothing found</EmptyTitle>
            <EmptyDescription>
              <Chord hotkey="Mod+P" /> to search notes
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CommandEmpty>
      {groups.map((group) =>
        group.actions.length === 0 ? null : (
          <CommandGroup heading={group.heading} key={group.heading}>
            {group.actions.map(({ Icon, label, onSelect, text, value }) => {
              const chords = chordsByName.get(label);

              return (
                <CommandItem
                  key={value}
                  onSelect={() => {
                    const next = [
                      value,
                      ...history.filter((previous) => previous !== value),
                    ];
                    writeStored(
                      STORAGE_KEY,
                      next,
                      "could not remember command"
                    );
                    setHistory(next);
                    onSelect();
                  }}
                  value={value}
                >
                  <Icon />
                  {text}
                  {chords === undefined ? null : (
                    <CommandShortcut>
                      {chords.map(({ hotkey, id }) => (
                        <Chord hotkey={hotkey} key={id} />
                      ))}
                    </CommandShortcut>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )
      )}
    </>
  );
}
