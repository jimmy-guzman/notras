import { CodeIcon, CrosshairIcon, KeyboardIcon } from "lucide-react";

import type { SaveStatus } from "@/components/editor/use-autosave";

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
  focusModeEnabled: boolean;
  onToggleFocusMode: () => void;
  onToggleSource: () => void;
  onToggleTypewriter: () => void;
  sourceEnabled: boolean;
  status: SaveStatus;
  typewriterEnabled: boolean;
  words: number;
}

export function StatusBar({
  focusModeEnabled,
  onToggleFocusMode,
  onToggleSource,
  onToggleTypewriter,
  sourceEnabled,
  status,
  typewriterEnabled,
  words,
}: StatusBarProps) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
      <span className={cn(status === "saved" && "text-faint")}>
        {STATUS_LABEL[status]}
      </span>
      <span className="ml-auto tabular-nums">
        {words} {words === 1 ? "word" : "words"} · {readingTime(words)}
      </span>
      <div className="flex items-center gap-0.5">
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
