import { FileCodeIcon, FocusIcon, WaypointsIcon } from "lucide-react";

import { Chord } from "@/components/chord";
import { MentionsOf } from "@/components/notes/note-mentions";
import { NoteTags } from "@/components/notes/note-tags";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHROME_GLYPH } from "@/lib/ui/chrome";
import { useChordsByName } from "@/lib/ui/shortcuts";

interface StatusBarProps {
  focusModeEnabled: boolean;
  graphEnabled: boolean;
  /** External files do not belong to the saved library. */
  note?: { path: string; tags: string[] };
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleGraph: () => void;
  onToggleSource: () => void;
  sourceEnabled: boolean;
  words: number;
}

export function StatusBar({
  focusModeEnabled,
  graphEnabled,
  note,
  onFilterTag,
  onToggleFocusMode,
  onToggleGraph,
  onToggleSource,
  sourceEnabled,
  words,
}: StatusBarProps) {
  const hasNote = note !== undefined;
  const chordsByName = useChordsByName();
  const toggles = [
    {
      icon: FocusIcon,
      label: "focus mode",
      onToggle: onToggleFocusMode,
      pressed: focusModeEnabled,
      value: "focus",
    },
    {
      icon: FileCodeIcon,
      label: "markdown source",
      onToggle: onToggleSource,
      pressed: sourceEnabled,
      value: "source",
    },
    ...(hasNote
      ? [
          {
            icon: WaypointsIcon,
            label: "graph view",
            onToggle: onToggleGraph,
            pressed: graphEnabled,
            value: "graph",
          },
        ]
      : []),
  ];

  const handleToggleChange = (next: string[]) => {
    const pressed = new Set(next);
    toggles
      .find((toggle) => pressed.has(toggle.value) !== toggle.pressed)
      ?.onToggle();
  };

  return (
    <footer className="bg-card text-muted-foreground flex h-8 shrink-0 items-center gap-1 p-1 text-xs">
      {note === undefined ? null : (
        <>
          <NoteTags onFilter={onFilterTag} path={note.path} tags={note.tags} />
          {/* Keyed so a tab switch closes the previous note's mentions list. */}
          <MentionsOf key={note.path} path={note.path} />
        </>
      )}
      <span className="ms-auto shrink-0 px-1.5 tabular-nums">
        {words} {words === 1 ? "word" : "words"}
      </span>
      <ToggleGroup
        multiple
        onValueChange={handleToggleChange}
        size="icon-xs"
        spacing={1}
        value={toggles.flatMap((toggle) =>
          toggle.pressed ? [toggle.value] : []
        )}
      >
        {toggles.map(({ icon: Icon, label, value }) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={<ToggleGroupItem aria-label={label} value={value} />}
            >
              <Icon className={CHROME_GLYPH} />
            </TooltipTrigger>
            <TooltipContent>
              {label}
              {chordsByName.get(label)?.map(({ hotkey, id }) => (
                <Chord hotkey={hotkey} key={id} />
              ))}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </footer>
  );
}
