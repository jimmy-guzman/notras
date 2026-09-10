import { CodeIcon, FocusIcon, WaypointsIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

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
import { readingTime } from "@/lib/utils/word-count";

/** Tone for pressed and surface for hover, which the shipped variant collapses into one. */
const PRESSED = "aria-pressed:bg-transparent aria-pressed:text-foreground";

interface StatusBarProps {
  allTags: { count: number; tag: string }[];
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
  allTags,
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
  const toggles = useMemo(
    () => [
      {
        hotkey: "Mod+D",
        icon: FocusIcon,
        label: "focus mode",
        onToggle: onToggleFocusMode,
        pressed: focusModeEnabled,
        value: "focus",
      },
      {
        hotkey: "Mod+E",
        icon: CodeIcon,
        label: "markdown source",
        onToggle: onToggleSource,
        pressed: sourceEnabled,
        value: "source",
      },
      ...(hasNote
        ? [
            {
              hotkey: "Mod+Alt+G",
              icon: WaypointsIcon,
              label: "graph view",
              onToggle: onToggleGraph,
              pressed: graphEnabled,
              value: "graph",
            },
          ]
        : []),
    ],
    [
      focusModeEnabled,
      graphEnabled,
      hasNote,
      onToggleFocusMode,
      onToggleGraph,
      onToggleSource,
      sourceEnabled,
    ]
  );

  const handleToggleChange = useCallback(
    (next: string[]) => {
      toggles
        .find((toggle) => next.includes(toggle.value) !== toggle.pressed)
        ?.onToggle();
    },
    [toggles]
  );

  return (
    <footer className="flex h-7 shrink-0 items-center gap-1 bg-card px-3 text-muted-foreground text-xs shadow-[inset_0_1px_0_var(--border)]">
      {note === undefined ? null : (
        <>
          <NoteTags
            allTags={allTags}
            onFilter={onFilterTag}
            path={note.path}
            tags={note.tags}
          />
          {/* Keyed so a tab switch closes the previous note's mentions list. */}
          <MentionsOf key={note.path} path={note.path} />
        </>
      )}
      <span className="ml-auto shrink-0 px-2 tabular-nums">
        {words} {words === 1 ? "word" : "words"} · {readingTime(words)}
      </span>
      <ToggleGroup
        multiple
        onValueChange={handleToggleChange}
        size="icon-xs"
        spacing={0.5}
        value={toggles
          .filter((toggle) => toggle.pressed)
          .map((toggle) => toggle.value)}
      >
        {toggles.map(({ hotkey, icon: Icon, label, value }) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  aria-label={label}
                  className={PRESSED}
                  value={value}
                />
              }
            >
              <Icon className={CHROME_GLYPH} />
            </TooltipTrigger>
            <TooltipContent>
              {label} <Chord hotkey={hotkey} />
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </footer>
  );
}
