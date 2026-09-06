import { CodeIcon, CrosshairIcon, KeyboardIcon } from "lucide-react";
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
  /**
   * Absent for an external file, which carries no frontmatter to tag and sits
   * in no index to be mentioned from. `title` is the indexed one, which is
   * what other notes write, and it is absent until the note list carries it.
   */
  note?: { path: string; tags: string[]; title?: string };
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleSource: () => void;
  onToggleTypewriter: () => void;
  sourceEnabled: boolean;
  typewriterEnabled: boolean;
  words: number;
}

export function StatusBar({
  allTags,
  focusModeEnabled,
  note,
  onFilterTag,
  onToggleFocusMode,
  onToggleSource,
  onToggleTypewriter,
  sourceEnabled,
  typewriterEnabled,
  words,
}: StatusBarProps) {
  const toggles = useMemo(
    () => [
      {
        hotkey: "Mod+D",
        icon: CrosshairIcon,
        label: "focus mode",
        onToggle: onToggleFocusMode,
        pressed: focusModeEnabled,
        value: "focus",
      },
      {
        hotkey: "Mod+Alt+T",
        icon: KeyboardIcon,
        label: "typewriter scrolling",
        onToggle: onToggleTypewriter,
        pressed: typewriterEnabled,
        value: "typewriter",
      },
      {
        hotkey: "Mod+E",
        icon: CodeIcon,
        label: "markdown source",
        onToggle: onToggleSource,
        pressed: sourceEnabled,
        value: "source",
      },
    ],
    [
      focusModeEnabled,
      onToggleFocusMode,
      onToggleSource,
      onToggleTypewriter,
      sourceEnabled,
      typewriterEnabled,
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
    <footer className="flex h-7 shrink-0 items-center gap-1 border-t bg-card px-3 text-muted-foreground text-xs">
      {note === undefined ? null : (
        <>
          <NoteTags
            allTags={allTags}
            onFilter={onFilterTag}
            path={note.path}
            tags={note.tags}
          />
          {note.title === undefined ? null : (
            /* Keyed so a tab switch remounts it, closing a list opened over the last note. */
            <MentionsOf key={note.path} path={note.path} title={note.title} />
          )}
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
