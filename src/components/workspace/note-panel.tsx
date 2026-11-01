import { useQuery } from "@tanstack/react-query";
import { LinkIcon, ListTreeIcon, TagIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chord } from "@/components/chord";
import { NoteLabel } from "@/components/notes/note-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { contextFrom } from "@/core/links";
import { noteQueries } from "@/data/queries";
import { changeNoteMetadata, openNote, useTabSnapshot } from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { reasonOf } from "@/lib/ui/failure";
import {
  closeNotePanel,
  setOutlineHost,
  showNotePanelTab,
  useNotePanel,
} from "@/lib/ui/note-panel";
import type { NotePanelTab } from "@/lib/ui/note-panel";
import { useChordsByName } from "@/lib/ui/shortcuts";

function Mentions({ path }: { path: string }) {
  const mentions = useQuery(noteQueries.mentions(path));
  const list = useRef<HTMLUListElement>(null);

  // Opened before the mentions arrived, the panel took focus itself; the
  // first row takes it over once there is one.
  const arrived = mentions.data;

  useEffect(() => {
    const holder = document.activeElement;

    if (
      arrived !== undefined &&
      holder instanceof HTMLElement &&
      holder.dataset.notePanel !== undefined
    ) {
      list.current?.querySelector("button")?.focus();
    }
  }, [arrived]);

  // Rows already loaded stay through a failed refresh, which the query
  // cache reports on its own.
  if (mentions.data === undefined) {
    return mentions.isError ? (
      <div className="px-2 text-sm" role="alert">
        <p>could not load mentions</p>
        <p className="text-muted-foreground">{reasonOf(mentions.error)}</p>
        <Button
          onClick={() => {
            void mentions.refetch();
          }}
          size="sm"
          variant="ghost"
        >
          retry
        </Button>
      </div>
    ) : (
      <output className="text-muted-foreground block px-2 text-sm">
        loading mentions...
      </output>
    );
  }

  if (mentions.data.length === 0) {
    return (
      <p className="text-muted-foreground px-2 text-sm">no notes link here</p>
    );
  }

  return (
    <ul className="flex flex-col" ref={list}>
      {mentions.data.map(({ lines, note }) => {
        const [first] = lines;

        return (
          <li key={note.path}>
            <button
              className="hover:bg-muted dark:hover:bg-muted/50 focus-visible:outline-ring flex w-full min-w-0 flex-col rounded-md px-2 py-1.5 text-start text-sm transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2"
              onClick={() => {
                // Beside the note being read, so that note stays open.
                openNote(note.path, true);
              }}
              type="button"
            >
              <NoteLabel note={note} />
              <span className="text-muted-foreground line-clamp-2 text-xs">
                {contextFrom(first)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Tags({ id, path }: { id: string; path: string }) {
  const snapshot = useTabSnapshot(id);
  const [draft, setDraft] = useState("");
  const vocabulary = useQuery(noteQueries.tags());

  if (snapshot === undefined) {
    return null;
  }

  const { tags } = snapshot;
  const typed = draft.trim().replace(/^#/u, "").toLowerCase();
  const carried = new Set(tags);

  const suggestions =
    typed === "" || vocabulary.data === undefined
      ? []
      : vocabulary.data
          .filter(({ tag }) => tag.startsWith(typed) && !carried.has(tag))
          .slice(0, 6);

  const toggle = async (tag: string) => {
    setDraft("");

    try {
      await changeNoteMetadata(path, (current) => ({
        tags: [...new Set(current.tags).symmetricDifference(new Set([tag]))],
      }));
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not update tags",
        type: "error",
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 px-2">
      {tags.length === 0 ? null : (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              className="bg-muted text-foreground dark:bg-muted/50 inline-flex h-6 items-center gap-0.5 rounded-sm ps-1.5 pe-0.5 text-xs"
              key={tag}
            >
              {tag}
              <button
                aria-label={`remove ${tag}`}
                className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex size-5 items-center justify-center rounded-sm transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2"
                onClick={() => {
                  void toggle(tag);
                }}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        aria-label="add a tag"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && typed !== "" && !carried.has(typed)) {
            void toggle(typed);
          }
        }}
        placeholder="add a tag..."
        value={draft}
      />
      {vocabulary.isError && vocabulary.data === undefined ? (
        <div className="text-sm" role="alert">
          <p>could not load tag suggestions</p>
          <p className="text-muted-foreground">{reasonOf(vocabulary.error)}</p>
          <Button
            onClick={() => {
              void vocabulary.refetch();
            }}
            size="sm"
            variant="ghost"
          >
            retry
          </Button>
        </div>
      ) : null}
      {typed !== "" && vocabulary.isPending ? (
        <output className="text-muted-foreground block text-sm">
          loading tag suggestions...
        </output>
      ) : null}
      {suggestions.length === 0 ? null : (
        <ul className="flex flex-col">
          {suggestions.map(({ tag }) => (
            <li key={tag}>
              <button
                className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 focus-visible:outline-ring w-full rounded-md px-2 py-1 text-start text-sm transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2"
                onClick={() => {
                  void toggle(tag);
                }}
                type="button"
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Each label is also the name its chord registers under, so the tooltip reads the binding. */
const TOGGLES: {
  Icon: typeof LinkIcon;
  label: string;
  tab: NotePanelTab;
}[] = [
  { Icon: ListTreeIcon, label: "outline", tab: "outline" },
  { Icon: LinkIcon, label: "mentions", tab: "mentions" },
  { Icon: TagIcon, label: "tags", tab: "tags" },
];

/** What a tab can show: only a library note has mentions and tags. */
function shownTab(tab: Tab | undefined, wanted: NotePanelTab) {
  return tab?.kind === "note" ? wanted : "outline";
}

/**
 * The panel's own toggles, carried in the band above it while it is open.
 * One shows at a time, lit; a click on the lit one keeps it.
 */
export function NotePanelToggles({ tab }: { tab: Tab | undefined }) {
  const panel = useNotePanel();
  const showing = shownTab(tab, panel.tab);
  const chords = useChordsByName();

  const toggles =
    tab?.kind === "note"
      ? TOGGLES
      : TOGGLES.filter((toggle) => toggle.tab === "outline");

  return (
    <ToggleGroup
      aria-label="note panel"
      onValueChange={([picked]) => {
        if (picked !== undefined) {
          showNotePanelTab(picked);
        }
      }}
      spacing={0}
      value={[showing]}
    >
      {toggles.map(({ Icon, label, tab: value }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                aria-label={label}
                size="icon-xs"
                value={value}
              />
            }
          >
            <Icon className={BAR_GLYPH} />
          </TooltipTrigger>
          <TooltipContent>
            {label}
            {chords.get(label)?.map(({ hotkey, id }) => (
              <Chord hotkey={hotkey} key={id} />
            ))}
          </TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}

/** The first control in the panel, or the panel itself when it shows none. */
function focusPanel(panel: HTMLElement) {
  const first = panel.querySelector<HTMLElement>(
    "button:not([hidden] *), input"
  );

  (first ?? panel).focus();
}

/** The left card: whichever of the outline, mentions and tags its toggles picked. */
export function NotePanel({ tab }: { tab: Tab | undefined }) {
  const panel = useNotePanel();
  const showing = shownTab(tab, panel.tab);
  const card = useRef<HTMLElement>(null);

  // Opening takes focus into the panel, as the browser does, so the button
  // that opened it can move to the band without stranding focus.
  useEffect(() => {
    if (panel.focus > 0 && card.current !== null) {
      focusPanel(card.current);
    }
  }, [panel.focus]);

  // Escape anywhere inside dismisses it, as Escape dismisses the browser.
  useEffect(() => {
    const element = card.current;

    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeNotePanel();
      }
    };

    element?.addEventListener("keydown", dismiss);

    return () => {
      element?.removeEventListener("keydown", dismiss);
    };
  }, []);

  return (
    <aside
      aria-label={`note panel: ${showing}`}
      className="bg-background text-foreground flex size-full min-h-0 flex-col outline-none"
      data-note-panel=""
      ref={card}
      tabIndex={-1}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {/* The showing editor portals its live outline in here. */}
          <div hidden={showing !== "outline"} ref={setOutlineHost} />
          {showing === "mentions" && tab?.kind === "note" ? (
            <Mentions path={tab.path} />
          ) : null}
          {showing === "tags" && tab?.kind === "note" ? (
            <Tags id={tab.id} path={tab.path} />
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
