import { CodeIcon, CrosshairIcon, KeyboardIcon } from "lucide-react";

import { NoteTags } from "@/components/notes/note-tags";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readingTime } from "@/lib/utils/word-count";

/** Tone for pressed and surface for hover, which the shipped variant collapses into one. */
const PRESSED = "aria-pressed:bg-transparent aria-pressed:text-foreground";

interface StatusBarProps {
  allTags: { count: number; tag: string }[];
  focusModeEnabled: boolean;
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleSource: () => void;
  onToggleTypewriter: () => void;
  path: string;
  sourceEnabled: boolean;
  tags: string[];
  typewriterEnabled: boolean;
  words: number;
}

export function StatusBar({
  allTags,
  focusModeEnabled,
  onFilterTag,
  onToggleFocusMode,
  onToggleSource,
  onToggleTypewriter,
  path,
  sourceEnabled,
  tags,
  typewriterEnabled,
  words,
}: StatusBarProps) {
  const toggles = [
    {
      hint: "⌘d",
      icon: CrosshairIcon,
      label: "focus mode",
      onToggle: onToggleFocusMode,
      pressed: focusModeEnabled,
      value: "focus",
    },
    {
      hint: "",
      icon: KeyboardIcon,
      label: "typewriter scrolling",
      onToggle: onToggleTypewriter,
      pressed: typewriterEnabled,
      value: "typewriter",
    },
    {
      hint: "⌘p",
      icon: CodeIcon,
      label: "markdown source",
      onToggle: onToggleSource,
      pressed: sourceEnabled,
      value: "source",
    },
  ];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-1 border-t px-3 text-xs text-muted-foreground">
      <NoteTags
        allTags={allTags}
        onFilter={onFilterTag}
        path={path}
        tags={tags}
      />
      <span className="ml-auto shrink-0 px-2 tabular-nums">
        {words} {words === 1 ? "word" : "words"} · {readingTime(words)}
      </span>
      <ToggleGroup
        multiple
        onValueChange={(next) => {
          toggles
            .find((toggle) => {
              return next.includes(toggle.value) !== toggle.pressed;
            })
            ?.onToggle();
        }}
        size="icon-xs"
        spacing={0.5}
        value={toggles
          .filter((toggle) => {
            return toggle.pressed;
          })
          .map((toggle) => {
            return toggle.value;
          })}
      >
        {toggles.map(({ hint, icon: Icon, label, value }) => {
          return (
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
                <Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                {label} {hint === "" ? null : <Kbd>{hint}</Kbd>}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
    </footer>
  );
}
