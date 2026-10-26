import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
  Data,
} from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import {
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { useSuspenseQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  ChevronDownIcon,
  Code2Icon,
  FileSymlinkIcon,
  FileTextIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Chord } from "@/components/chord";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteTitle } from "@/core/notes";
import { notesDirQuery } from "@/data/queries";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  getTabHandles,
  getTabState,
  moveTab,
  showTab,
  useTabSnapshot,
} from "@/lib/tabs/store";
import type { TabSnapshot } from "@/lib/tabs/store";
import type { Tab, TabStep } from "@/lib/tabs/tab";
import {
  stepTab,
  tabButtonId,
  tabFullPath,
  tabPanelId,
  tabRun,
} from "@/lib/tabs/tab";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { useGraphMode } from "@/lib/ui/graph";
import { useHotkey } from "@/lib/ui/shortcuts";
import { setTabListOpen, useTabListOpen } from "@/lib/ui/tab-list";

const STEPS = new Map<string, TabStep>([
  ["ArrowLeft", "previous"],
  ["ArrowRight", "next"],
  ["End", "end"],
  ["Home", "start"],
]);

const ACTIVATION_DISTANCE_PX = 4;

/** A tab's `min-w-24` and the strip's `gap-1`, which decide how many fit whole. */
const TAB_MIN_PX = 96;
const TAB_GAP_PX = 4;

const SHOW_TABS = "Mod+Shift+A";

/** dnd-kit defaults to 250ms; `DESIGN.md` names 0.15s for the bars. */
const TAB_TRANSITION = { duration: 150, easing: "ease" };

function isTabDrag(data: Data | undefined): data is { label: string } {
  return typeof data?.label === "string";
}

function draggedLabel(data: Data | undefined) {
  return isTabDrag(data) ? data.label : "";
}

/** dnd-kit's defaults announce the minted id (`D56`). */
const ANNOUNCEMENTS: Announcements = {
  onDragCancel: ({ active }) =>
    `left ${draggedLabel(active.data.current)} where it was`,
  onDragEnd: ({ active, over }) =>
    over === null
      ? `left ${draggedLabel(active.data.current)} where it was`
      : `dropped ${draggedLabel(active.data.current)} on ${draggedLabel(over.data.current)}`,
  onDragOver: ({ active, over }) =>
    over === null
      ? undefined
      : `${draggedLabel(active.data.current)} is over ${draggedLabel(over.data.current)}`,
  onDragStart: ({ active }) => `picked up ${draggedLabel(active.data.current)}`,
};

/** Also animate an order change no drag made, which is what `⌘⌥⇧←/→` does. */
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  args.isSorting || args.wasDragging ? defaultAnimateLayoutChanges(args) : true;

const MARKER_GLYPH = "text-muted-foreground me-1.5 size-3 shrink-0";

interface TabMarkerProps {
  snapshot: TabSnapshot | undefined;
  tab: Tab;
}

/**
 * The dot when a save failed or needs review, otherwise what the tab shows.
 * Graph wins over source because it covers the editor.
 */
function TabMarker({ snapshot, tab }: TabMarkerProps) {
  const graphMode = useGraphMode(tab.id);

  if (snapshot?.status === "failed" || snapshot?.status === "conflict") {
    return (
      // The glyph's box, so swapping one for the other never moves the label.
      <span
        className={cn(MARKER_GLYPH, "inline-flex items-center justify-center")}
      >
        <span className="bg-destructive size-1.5 rounded-full">
          <span className="sr-only">
            {[
              snapshot.status === "failed" ? "could not save" : "needs review",
              snapshot.reason,
            ]
              .filter((part) => part !== undefined)
              .join(": ")}
          </span>
        </span>
      </span>
    );
  }

  if (tab.kind === "note" && graphMode) {
    return <WaypointsIcon className={MARKER_GLYPH} />;
  }

  if (snapshot?.sourceMode === true) {
    return <Code2Icon className={MARKER_GLYPH} />;
  }

  return tab.kind === "external" ? (
    <FileSymlinkIcon className={MARKER_GLYPH} />
  ) : (
    <FileTextIcon className={MARKER_GLYPH} />
  );
}

interface TabItemProps {
  active: boolean;
  notesDir: string;
  /** The only tab has nowhere to go, so its press moves the window instead. */
  sole: boolean;
  tab: Tab;
}

function TabItem({ active, notesDir, sole, tab }: TabItemProps) {
  const { id } = tab;
  const snapshot = useTabSnapshot(id);
  const label = snapshot?.title ?? noteTitle(tab.path);

  const {
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    animateLayoutChanges,
    data: { label },
    disabled: sole,
    id,
    transition: TAB_TRANSITION,
  });

  const select = () => {
    activateTab(id);
  };

  /** A press selects, the way a native tab does, before any drag begins. */
  const startPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    showTab(id);
    listeners?.onPointerDown?.(event);
  };

  const close = () => {
    closeTab(id);
  };

  const closeOthers = () => {
    closeOtherTabs(id);
  };

  const closeAfter = () => {
    closeTabsAfter(id);
  };

  const copyPath = () => {
    void copyTabPath(tabFullPath(tab, notesDir));
  };

  return (
    <ContextMenu>
      {/* Presentational so the tablist reads as holding tabs, with the close
          button a sibling of the tab rather than a child of it. */}
      <span
        className={cn(
          "group tab-motion hover:text-foreground has-[:focus-visible]:outline-ring flex h-6 max-w-56 min-w-24 flex-1 basis-0 items-center rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2",
          active
            ? "bg-background text-foreground"
            : "hover:bg-muted dark:hover:bg-muted/50",
          isDragging && "shadow-drag z-10 cursor-grabbing"
        )}
        ref={setNodeRef}
        role="presentation"
        style={{
          "--tab-transition": transition,
          "--tab-x": `${transform?.x ?? 0}px`,
        }}
      >
        <ContextMenuTrigger
          className="flex min-w-0 flex-1 items-center self-stretch"
          data-tauri-drag-region={sole ? undefined : "false"}
          render={<span role="presentation" />}
        >
          <button
            aria-controls={tabPanelId(id)}
            aria-selected={active}
            className="flex min-w-0 flex-1 items-center ps-1.5 text-start focus-visible:outline-none"
            // `deep`, since a bare mark only counts a press on the button itself
            // and the label and glyph sit inside it.
            data-tauri-drag-region={sole ? "deep" : undefined}
            id={tabButtonId(id)}
            onClick={select}
            // The handle, so the close button beside it never starts a drag.
            onPointerDown={startPress}
            ref={setActivatorNodeRef}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            <TabMarker snapshot={snapshot} tab={tab} />
            <span className="truncate">{label}</span>
          </button>
          <button
            aria-label={`close ${label}`}
            className={cn(
              "hover:bg-muted hover:text-foreground ms-1 me-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-all duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100",
              active && "text-muted-foreground opacity-100"
            )}
            data-tab-close
            onClick={close}
            tabIndex={-1}
            type="button"
          >
            <XIcon className={BAR_GLYPH} />
          </button>
        </ContextMenuTrigger>
      </span>
      <ContextMenuContent>
        <ContextMenuItem onClick={close}>close</ContextMenuItem>
        <ContextMenuItem onClick={closeOthers}>close others</ContextMenuItem>
        <ContextMenuItem onClick={closeAfter}>
          close to the right
        </ContextMenuItem>
        {tab.kind === "draft" ? null : (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={copyPath}>copy path</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface TabListItemProps {
  tab: Tab;
}

function TabListItem({ tab }: TabListItemProps) {
  const snapshot = useTabSnapshot(tab.id);
  const label = snapshot?.title ?? noteTitle(tab.path);

  return (
    <DropdownMenuRadioItem closeOnClick value={tab.id}>
      {label}
    </DropdownMenuRadioItem>
  );
}

interface TabListMenuProps {
  activeId: string;
  tabs: Tab[];
}

/** Every open tab, including the ones the strip has no room for. */
function TabListMenu({ activeId, tabs }: TabListMenuProps) {
  const open = useTabListOpen();
  const picked = useRef(false);
  const chevron = useRef<HTMLButtonElement>(null);

  useHotkey(
    SHOW_TABS,
    () => {
      setTabListOpen(true);
    },
    { meta: { name: "show tabs" } }
  );

  // The store outlives the strip, so a list left open would greet the next tab.
  useEffect(
    () => () => {
      setTabListOpen(false);
    },
    []
  );

  useEffect(() => {
    if (open) {
      picked.current = false;
    }
  }, [open]);

  const pick = (id: string) => {
    picked.current = true;
    activateTab(id);
  };

  // The note focuses through its handle, since returning it would skip the
  // editor's scroll restore. The chevron is returned, not true, because focus
  // from before ⌘⇧A may sit in a note the pick made inert.
  const focusOnClose = () => {
    if (!picked.current) {
      return true;
    }

    getTabHandles(getTabState().activeId)?.focus();

    const holder = document.activeElement;

    const landed =
      holder !== null &&
      holder !== document.body &&
      holder.closest('[role="menu"]') === null;

    return landed ? false : chevron.current;
  };

  return (
    <DropdownMenu onOpenChange={setTabListOpen} open={open}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="show tabs"
                  ref={chevron}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            />
          }
        >
          <ChevronDownIcon className={BAR_GLYPH} />
        </TooltipTrigger>
        <TooltipContent>
          show tabs <Chord hotkey={SHOW_TABS} />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-56" finalFocus={focusOnClose}>
        <DropdownMenuRadioGroup onValueChange={pick} value={activeId}>
          {tabs.map((tab) => (
            <TabListItem key={tab.id} tab={tab} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TabListProps {
  activeId: string;
  tabs: Tab[];
}

function handleDragStart(event: DragStartEvent) {
  showTab(String(event.active.id));
}

/**
 * The open tabs, in the title bar where the note's title used to sit (`D52`).
 *
 * One tab stop with arrow keys inside it.
 * Dragging one is dnd-kit's, and `D60` carries why. A tab among neighbours
 * keeps its press for the tab drag, and a lone tab has nowhere to go, so it
 * hands the press to the window instead.
 */
function TabList({ activeId, tabs }: TabListProps) {
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  // Every tab until first measured.
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  const [previous, setPrevious] = useState(0);
  const run = tabRun({ activeId, tabs }, fit, previous);
  const ids = tabs.map((tab) => tab.id);

  if (run.start !== previous) {
    setPrevious(run.start);
  }

  // No keyboard sensor: it wants the `attributes` spread, which would overwrite
  // the `role="tab"` wiring, and `⌘⌥⇧←/→` already reorders (`D60`).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ACTIVATION_DISTANCE_PX },
    })
  );

  const observeWidth = (list: HTMLDivElement) => {
    // Synchronous, or a frame of cut tabs paints first.
    const observer = new ResizeObserver(() => {
      flushSync(() => {
        setFit(
          Math.floor(
            (list.clientWidth + TAB_GAP_PX) / (TAB_MIN_PX + TAB_GAP_PX)
          )
        );
      });
    });

    observer.observe(list);

    return () => {
      observer.disconnect();
    };
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS.get(event.key);

    if (step === undefined) {
      return;
    }

    const target = stepTab({ activeId, tabs }, step);

    if (target === undefined) {
      return;
    }

    event.preventDefault();
    // Synchronous, so the target is in the strip before it takes focus.
    flushSync(() => {
      activateTab(target.id);
    });
    // Focus follows, or `tabIndex` moves to the new tab while focus stays on
    // the old one and Enter fires whichever button was left behind.
    event.currentTarget
      .querySelector<HTMLElement>(`#${CSS.escape(tabButtonId(target.id))}`)
      ?.focus();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over === null || active.id === over.id) {
      return;
    }

    moveTab(String(active.id), ids.indexOf(String(over.id)));
  };

  return (
    <>
      <TabListMenu activeId={activeId} tabs={tabs} />
      <DndContext
        accessibility={{ announcements: ANNOUNCEMENTS }}
        collisionDetection={closestCenter}
        // What lets `animateLayoutChanges` see a change no drag made.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext
          items={run.tabs.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-clip"
            onKeyDown={handleKeyDown}
            ref={observeWidth}
            role="tablist"
            tabIndex={-1}
          >
            {run.tabs.map((tab) => (
              <TabItem
                active={tab.id === activeId}
                key={tab.id}
                notesDir={notesDir}
                sole={tabs.length === 1}
                tab={tab}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

interface TabStripProps {
  activeId: string;
  tabs: Tab[];
}

/** The open tabs. With none, nothing covers the titlebar's drag region. */
export function TabStrip({ activeId, tabs }: TabStripProps) {
  return tabs.length === 0 ? null : <TabList activeId={activeId} tabs={tabs} />;
}
