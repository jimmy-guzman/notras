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
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BarButton } from "@/components/bar-button";
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { noteTitle } from "@/core/notes";
import { notesDirQuery } from "@/data/queries";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  moveTab,
  showTab,
  useTabSnapshot,
} from "@/lib/tabs/store";
import type { Tab, TabStep } from "@/lib/tabs/tab";
import { stepTab, tabButtonId, tabFullPath, tabPanelId } from "@/lib/tabs/tab";
import { BAR_GLYPH } from "@/lib/ui/bar";

const STEPS = new Map<string, TabStep>([
  ["ArrowLeft", "previous"],
  ["ArrowRight", "next"],
  ["End", "end"],
  ["Home", "start"],
]);

const ACTIVATION_DISTANCE_PX = 4;

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
  const ref = useRef<HTMLSpanElement | null>(null);
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

  // Keyboard switching can land on a tab that is scrolled out of the strip.
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  const setRefs = (node: HTMLSpanElement | null) => {
    ref.current = node;
    setNodeRef(node);
  };

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
      <ContextMenuTrigger
        render={
          // Presentational so the tablist reads as holding tabs, with the
          // close button a sibling of the tab rather than a child of it.
          <span
            className={cn(
              "group tab-motion hover:text-foreground has-[:focus-visible]:outline-ring flex h-6 max-w-56 min-w-24 flex-1 basis-0 items-center rounded-sm ps-1.5 pe-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2",
              active
                ? "bg-background text-foreground"
                : "hover:bg-muted dark:hover:bg-muted/50",
              // oxlint-disable-next-line shadcn/no-raw-colors -- shadcn-ui/lint#10: a custom --shadow-* token reads as a color
              isDragging && "shadow-drag z-10 cursor-grabbing"
            )}
            data-tab-id={id}
            data-tauri-drag-region={sole ? undefined : "false"}
            ref={setRefs}
            role="presentation"
            style={{
              "--tab-transition": transition,
              "--tab-x": `${transform?.x ?? 0}px`,
            }}
          />
        }
      >
        {snapshot?.status === "failed" || snapshot?.status === "conflict" ? (
          <span className="bg-destructive me-1.5 size-1.5 shrink-0 rounded-full">
            <span className="sr-only">
              {[
                snapshot.status === "failed"
                  ? "could not save"
                  : "needs review",
                snapshot.reason,
              ]
                .filter((part) => part !== undefined)
                .join(": ")}
            </span>
          </span>
        ) : null}
        <button
          aria-controls={tabPanelId(id)}
          aria-selected={active}
          className="min-w-0 flex-1 truncate text-start focus-visible:outline-none"
          data-tauri-drag-region={sole || undefined}
          id={tabButtonId(id)}
          onClick={select}
          // The handle, so the close button beside it never starts a drag.
          onPointerDown={startPress}
          ref={setActivatorNodeRef}
          role="tab"
          tabIndex={active ? 0 : -1}
          type="button"
        >
          {label}
        </button>
        <button
          aria-label={`close ${label}`}
          className={cn(
            "hover:bg-muted hover:text-foreground ms-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-all duration-150 ease-out group-hover:opacity-100 focus-visible:opacity-100",
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

interface OverflowItemProps {
  tab: Tab;
}

function OverflowItem({ tab }: OverflowItemProps) {
  const snapshot = useTabSnapshot(tab.id);
  const label = snapshot?.title ?? noteTitle(tab.path);
  const select = () => {
    activateTab(tab.id);
  };

  return <DropdownMenuItem onClick={select}>{label}</DropdownMenuItem>;
}

interface OverflowMenuProps {
  hidden: Tab[];
}

/** The tabs the strip has scrolled out of reach. */
function OverflowMenu({ hidden }: OverflowMenuProps) {
  if (hidden.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`${hidden.length} ${hidden.length === 1 ? "tab" : "tabs"} out of view`}
            size="xs"
            variant="ghost"
          />
        }
      >
        {hidden.length}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hidden.map((tab) => (
          <OverflowItem key={tab.id} tab={tab} />
        ))}
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
 * One tab stop with arrow keys inside it, the `ToggleGroup` pattern `D37` set.
 * Dragging one is dnd-kit's, and `D60` carries why. A tab among neighbours
 * keeps its press for the tab drag, and a lone tab has nowhere to go, so it
 * hands the press to the window instead.
 */
function TabList({ activeId, tabs }: TabListProps) {
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  const listRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const ids = tabs.map((tab) => tab.id);
  // No keyboard sensor: it wants the `attributes` spread, which would overwrite
  // the `role="tab"` wiring, and `⌘⌥⇧←/→` already reorders (`D60`).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ACTIVATION_DISTANCE_PX },
    })
  );

  useEffect(() => {
    const list = listRef.current;
    const measure = () => {
      if (list === null) {
        return;
      }
      const open = new Set(ids);

      const next: string[] = [];
      for (const item of list.querySelectorAll<HTMLElement>("[data-tab-id]")) {
        // Not a rect: a drag transforms a tab out of its slot, and a rect
        // would call it hidden for being mid-slide.
        const outOfView =
          item.offsetLeft + item.offsetWidth <= list.scrollLeft + 1 ||
          item.offsetLeft >= list.scrollLeft + list.clientWidth - 1;
        const id = item.dataset.tabId ?? "";
        // A tab closed between the measurement and this frame still has a
        // node until React commits.
        if (outOfView && open.has(id)) {
          next.push(id);
        }
      }

      // Scrolling fires this every frame; only a real change may re-render.
      setHidden((current) =>
        current.length === next.length &&
        current.every((id, at) => id === next[at])
          ? current
          : next
      );
    };

    const observer = new ResizeObserver(measure);

    if (list !== null) {
      measure();
      observer.observe(list);
      list.addEventListener("scroll", measure);
    }

    return () => {
      observer.disconnect();
      list?.removeEventListener("scroll", measure);
    };
  }, [ids]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const step = STEPS.get(event.key);

    if (step === undefined) {
      return;
    }

    const target = stepTab({ activeId, tabs }, step);

    if (target === undefined) {
      return;
    }

    event.preventDefault();
    activateTab(target.id);
    // Focus follows, or `tabIndex` moves to the new tab while focus stays on
    // the old one and Enter fires whichever button was left behind.
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(tabButtonId(target.id))}`)
      ?.focus();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over === null || active.id === over.id) {
      return;
    }

    moveTab(String(active.id), ids.indexOf(String(over.id)));
  };

  const hiddenIds = new Set(hidden);

  return (
    <>
      <DndContext
        accessibility={{ announcements: ANNOUNCEMENTS }}
        collisionDetection={closestCenter}
        // What lets `animateLayoutChanges` see a change no drag made.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div
            // `relative` so a tab's `offsetParent` is the strip, which the
            // measure above reads against.
            className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            onKeyDown={handleKeyDown}
            ref={listRef}
            role="tablist"
            tabIndex={-1}
          >
            {tabs.map((tab) => (
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
      <OverflowMenu hidden={tabs.filter((tab) => hiddenIds.has(tab.id))} />
    </>
  );
}

interface TabStripProps {
  activeId: string;
  onNew: () => void;
  tabs: Tab[];
}

/**
 * The open tabs, then the button that makes one.
 *
 * With no tabs the button is the whole strip. Nothing is left to cover the
 * titlebar's drag region, so pressing the bar moves the window.
 */
export function TabStrip({ activeId, onNew, tabs }: TabStripProps) {
  if (tabs.length === 0) {
    return (
      <BarButton
        className="ms-auto"
        Icon={PlusIcon}
        label="new note"
        onClick={onNew}
      />
    );
  }

  return (
    <>
      <TabList activeId={activeId} tabs={tabs} />
      <BarButton Icon={PlusIcon} label="new note" onClick={onNew} />
    </>
  );
}
