import { useHotkey } from "@tanstack/react-hotkeys";
import { FileTextIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useCallback, useEffect } from "react";

import { Chord } from "@/components/chord";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Mention } from "@/core/links";
import { openNote } from "@/lib/tabs/store";
import { setMentionsOpen, useMentionsOpen } from "@/lib/ui/mentions";

/** The row clamps to one line, so a link deep in a paragraph would sit past the ellipsis. */
const CONTEXT_LEAD = 32;

function contextFrom(line: { context: string; target: string }) {
  const at = line.context.indexOf(`[[${line.target}]]`);
  const rough = Math.max(0, at - CONTEXT_LEAD);

  if (rough === 0) {
    return line.context;
  }

  const boundary = line.context.indexOf(" ", rough);
  const start = boundary === -1 || boundary >= at ? rough : boundary + 1;

  return `…${line.context.slice(start)}`;
}

interface MentionItemProps {
  mention: Mention;
}

function MentionItem({ mention }: MentionItemProps) {
  const { lines, note } = mention;
  const [first] = lines;

  const open = useCallback(
    (event: MouseEvent) => {
      openNote(note.path, event.metaKey);
    },
    [note.path]
  );

  return (
    <DropdownMenuItem className="items-start" onClick={open}>
      <FileTextIcon className="mt-0.5" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          {note.title}
          {note.folder === "" ? null : (
            <span className="text-muted-foreground text-xs">
              {" "}
              · {note.folder}
            </span>
          )}
          {/* The chip counts notes, so a note linking twice says so here. */}
          {lines.length === 1 ? null : (
            <span className="text-muted-foreground text-xs tabular-nums">
              {" "}
              · +{lines.length - 1}
            </span>
          )}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {contextFrom(first)}
        </span>
      </div>
    </DropdownMenuItem>
  );
}

interface NoteMentionsProps {
  mentions: Mention[];
}

/** Absent while nothing mentions the note: a zero would be chrome carrying no information. */
export function NoteMentions({ mentions }: NoteMentionsProps) {
  const open = useMentionsOpen();
  const count = mentions.length;

  useHotkey(
    "Mod+Shift+L",
    () => {
      setMentionsOpen(true);
    },
    { meta: { name: "show mentions" } }
  );

  // A request to show an empty list has nothing to anchor to, and left set it
  // would open the menu on its own the moment a first link arrived.
  useEffect(() => {
    if (count === 0 && open) {
      setMentionsOpen(false);
    }
  }, [count, open]);

  // The store outlives this component, and a list left open over a note that
  // closed would greet the next one.
  useEffect(() => () => setMentionsOpen(false), []);

  if (count === 0) {
    return null;
  }

  return (
    <DropdownMenu onOpenChange={setMentionsOpen} open={open}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Badge
                  className="text-muted-foreground tabular-nums outline-none hover:text-foreground"
                  render={<button type="button" />}
                  variant="ghost"
                />
              }
            />
          }
        >
          {count} {count === 1 ? "mention" : "mentions"}
        </TooltipTrigger>
        <TooltipContent>
          show mentions <Chord hotkey="Mod+Shift+L" />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-72 border border-border shadow-[0_8px_24px_rgb(0_0_0/0.18)] ring-0"
        side="top"
      >
        {mentions.map((mention) => (
          <MentionItem key={mention.note.path} mention={mention} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
