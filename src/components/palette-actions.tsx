import type { LucideIcon } from "lucide-react";
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
import type { useChordsByName } from "@/lib/ui/shortcuts";

/**
 * What an action needs on screen before it is offered. A note action reads
 * frontmatter, so an external file cannot answer it; a tab action acts on the
 * open set, which an external file answers as well as a note does.
 */
export type PaletteScope = "editor" | "none" | "note" | "tab";

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
}

export function ActionsView({ actions, chordsByName }: ActionsViewProps) {
  return (
    <>
      <CommandEmpty>
        <Empty className="p-6">
          <EmptyHeader>
            <EmptyTitle>nothing found</EmptyTitle>
            <EmptyDescription>
              <Chord hotkey="Mod+P" /> to search notes
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CommandEmpty>
      <CommandGroup heading="actions">
        {actions.map(({ Icon, label, onSelect, text, value }) => {
          const chords = chordsByName.get(label);

          return (
            <CommandItem key={value} onSelect={onSelect} value={value}>
              <Icon />
              {text}
              {chords === undefined ? null : (
                <CommandShortcut>
                  {chords.map(({ hotkey, id }) => (
                    // A selected row is `bg-muted`, which the chip otherwise
                    // matches exactly and disappears into.
                    <Chord
                      className="tracking-normal group-data-selected/command-item:bg-background"
                      hotkey={hotkey}
                      key={id}
                    />
                  ))}
                </CommandShortcut>
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
