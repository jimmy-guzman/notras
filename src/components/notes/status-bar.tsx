import { CodeIcon, CrosshairIcon, KeyboardIcon } from "lucide-react";

import type { SaveStatus } from "@/components/editor/use-autosave";

import { NoteTags } from "@/components/notes/note-tags";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/utils";
import { readingTime } from "@/lib/utils/word-count";

const STATUS_LABEL: Record<SaveStatus, string> = {
  dirty: "unsaved",
  saved: "saved",
  saving: "saving...",
};

interface StatusToggleProps {
  active: boolean;
  hint: string;
  icon: typeof CodeIcon;
  label: string;
  onToggle: () => void;
}

function StatusToggle({
  active,
  hint,
  icon: Icon,
  label,
  onToggle,
}: StatusToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "size-6",
              active && "bg-accent text-accent-foreground",
            )}
            onClick={onToggle}
            size="icon"
            variant="ghost"
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
}

interface StatusBarProps {
  allTags: { count: number; tag: string }[];
  focusModeEnabled: boolean;
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleSource: () => void;
  onToggleTypewriter: () => void;
  path: string;
  sourceEnabled: boolean;
  status: SaveStatus;
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
  status,
  tags,
  typewriterEnabled,
  words,
}: StatusBarProps) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
      <span className={cn("shrink-0", status === "saved" && "text-faint")}>
        {STATUS_LABEL[status]}
      </span>
      <NoteTags
        allTags={allTags}
        onFilter={onFilterTag}
        path={path}
        tags={tags}
      />
      <span className="ml-auto shrink-0 tabular-nums">
        {words} {words === 1 ? "word" : "words"} · {readingTime(words)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <StatusToggle
          active={focusModeEnabled}
          hint="⌘d"
          icon={CrosshairIcon}
          label="focus mode"
          onToggle={onToggleFocusMode}
        />
        <StatusToggle
          active={typewriterEnabled}
          hint=""
          icon={KeyboardIcon}
          label="typewriter scrolling"
          onToggle={onToggleTypewriter}
        />
        <StatusToggle
          active={sourceEnabled}
          hint="⌘p"
          icon={CodeIcon}
          label="markdown source"
          onToggle={onToggleSource}
        />
      </div>
    </footer>
  );
}
