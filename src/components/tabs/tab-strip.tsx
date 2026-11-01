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
import { restrictToParentElement } from "@dnd-kit/modifiers";
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
  PlusIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { BarButton } from "@/components/bar-button";
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
  openDraft,
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
import { useHotkey } from "@/lib/ui/shortcuts";
import { setTabListOpen, useTabListOpen } from "@/lib/ui/tab-list";
import { useTabView } from "@/lib/ui/view";
import type { TabView } from "@/lib/ui/view";

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

/** A tab's `max-w-56`. */
const TAB_MAX_PX = 224;

/** The new note button's `icon-xs` box after the last tab. */
const NEW_NOTE_PX = 24;

const SHOW_TABS = "Mod+Shift+A";

/** dnd-kit defaults to 250ms; the bars use 150ms. */
const TAB_TRANSITION = { duration: 150, easing: "ease" };

function isTabDrag(data: Data | undefined): data is { label: string } {
  return typeof data?.label === "string";
}

function draggedLabel(data: Data | undefined) {
  return isTabDrag(data) ? data.label : "";
}

/** dnd-kit's defaults announce the minted id. */
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

/** The view a tab shows, in the words the source and graph chords register under. */
const VIEW_NAMES: Record<TabView, string> = {
  graph: "graph view",
  note: "note",
  source: "markdown source",
};

interface TabMarkerProps {
  snapshot: TabSnapshot | undefined;
  tab: Tab;
  view: TabView;
}

/** The dot when a save failed or needs review, otherwise the view the tab shows. */
function TabMarker({ snapshot, tab, view }: TabMarkerProps) {
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

  if (view === "graph") {
    return <WaypointsIcon className={MARKER_GLYPH} />;
  }

  if (view === "source") {
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
  const view = useTabView(id);
  const label = snapshot?.title ?? noteTitle(tab.path);
  const viewId = `${tabButtonId(id)}-view`;

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
          "group tab-motion tab-shape hover:text-foreground has-[:focus-visible]:outline-ring flex h-7 max-w-56 min-w-24 flex-1 basis-0 items-center rounded-t-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2",
          active
            ? "bg-background text-foreground"
            : "hover:bg-muted dark:hover:bg-muted/50",
          isDragging && "shadow-drag z-10 cursor-grabbing"
        )}
        data-active={active || undefined}
        data-dragging={isDragging || undefined}
        ref={setNodeRef}
        role="presentation"
        style={{
          "--tab-transition": transition,
          "--tab-x": `${transform?.x ?? 0}px`,
        }}
      >
        <span aria-hidden className="tab-divider" />
        <ContextMenuTrigger
          className="flex min-w-0 flex-1 items-center self-stretch"
          data-tauri-drag-region={sole ? undefined : "false"}
          render={<span role="presentation" />}
        >
          <button
            aria-controls={tabPanelId(id)}
            aria-describedby={viewId}
            aria-selected={active}
            // The whole box, with the close button floating over its end, so
            // every press outside that button is the tab's.
            className="flex min-w-0 flex-1 items-center self-stretch ps-1.5 pe-7 text-start focus-visible:outline-none"
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
            <TabMarker snapshot={snapshot} tab={tab} view={view} />
            <span className="truncate">{label}</span>
          </button>
          {/* Hidden and beside the tab, so the view describes it without joining its name or text. */}
          <span hidden id={viewId}>
            {VIEW_NAMES[view]}
          </span>
          <button
            aria-label={`close ${label}`}
            className={cn(
              "hover:bg-muted hover:text-foreground absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-sm opacity-0 transition duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100",
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
 * The open tabs, in the title bar where the note's title used to sit.
 *
 * One tab stop with arrow keys inside it.
 * dnd-kit owns tab dragging. A tab among neighbours
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
  // the `role="tab"` wiring, and `⌘⌥⇧←/→` already reorders.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ACTIVATION_DISTANCE_PX },
    })
  );

  const observeWidth = (list: HTMLDivElement) => {
    // Synchronous, or a frame of cut tabs paints first.
    const observer = new ResizeObserver(() => {
      flushSync(() => {
        // `clientWidth` holds two gaps of padding for the feet, and new note
        // takes its width and the gap before it.
        setFit(
          Math.floor(
            (list.clientWidth - 2 * TAB_GAP_PX - NEW_NOTE_PX) /
              (TAB_MIN_PX + TAB_GAP_PX)
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

    // A tab's context menu is portaled out of the list but still bubbles its
    // keys here through React, and its arrows belong to the menu.
    if (
      step === undefined ||
      !(event.target instanceof Node) ||
      !event.currentTarget.contains(event.target)
    ) {
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
        modifiers={[restrictToParentElement]}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext
          items={run.tabs.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            // Room inside the clip for the feet and the 4px the tabs run below the row.
            className="-mx-1 -mb-1 flex h-7 min-w-0 flex-1 items-center gap-1 overflow-clip px-1"
            ref={observeWidth}
          >
            <div
              className="flex h-7 max-w-(--tabs-max) min-w-0 flex-1 items-center gap-1"
              onKeyDown={handleKeyDown}
              role="tablist"
              // Fills the room as the tabs do, but no wider than they can grow,
              // so new note follows the last one. Shrink-wrapping the tabs
              // instead sizes the list by their titles in WebKit, which cuts a
              // long title with room to spare.
              style={{
                "--tabs-max": `${run.tabs.length * (TAB_MAX_PX + TAB_GAP_PX) - TAB_GAP_PX}px`,
              }}
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
            {/* Top-aligned with the tab labels, which sit above the tabs' 4px
                feet, and as tall as a tab so its divider centers with theirs. */}
            <span className="relative flex h-7 shrink-0 items-start">
              <span aria-hidden className="tab-divider" />
              <BarButton Icon={PlusIcon} label="new note" onClick={openDraft} />
            </span>
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
