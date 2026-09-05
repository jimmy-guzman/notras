import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteTitle } from "@/core/notes";
import { noteQueries } from "@/data/queries";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  activateTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  moveTab,
  useTabSnapshot,
} from "@/lib/tabs/store";
import type { Tab, TabStep } from "@/lib/tabs/tab";
import { stepTab, tabButtonId, tabId, tabPanelId } from "@/lib/tabs/tab";
import { CHROME_GLYPH } from "@/lib/ui/chrome";

const STEPS: Record<string, TabStep> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  End: "end",
  Home: "start",
};

const ACTIVATION_DISTANCE_PX = 4;

/** dnd-kit defaults to 250ms; `DESIGN.md` names 0.15s for chrome. */
const TAB_TRANSITION = { duration: 150, easing: "ease" };

function draggedLabel(data: Record<string, unknown> | undefined) {
  return typeof data?.label === "string" ? data.label : "";
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
  /** Shown until the session publishes a title off its live buffer. */
  fallback: string;
  /** The only tab has nowhere to go, so its press moves the window instead. */
  sole: boolean;
  tab: Tab;
}

function TabItem({ active, fallback, sole, tab }: TabItemProps) {
  const id = tabId(tab);
  const snapshot = useTabSnapshot(id);
  const ref = useRef<HTMLSpanElement | null>(null);
  const label = snapshot?.title ?? fallback;
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

  const setRefs = useCallback(
    (node: HTMLSpanElement | null) => {
      ref.current = node;
      setNodeRef(node);
    },
    [setNodeRef]
  );

  const select = useCallback(() => {
    activateTab(id);
  }, [id]);

  /** A press selects, the way a native tab does, before any drag begins. */
  const startPress = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      select();
      listeners?.onPointerDown?.(event);
    },
    [listeners, select]
  );

  const close = useCallback(() => {
    closeTab(id);
  }, [id]);

  const closeOthers = useCallback(() => {
    closeOtherTabs(id);
  }, [id]);

  const closeAfter = useCallback(() => {
    closeTabsAfter(id);
  }, [id]);

  const copyPath = useCallback(() => {
    copyTabPath(tab.path);
  }, [tab.path]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          // Presentational so the tablist reads as holding tabs, with the
          // close button a sibling of the tab rather than a child of it.
          <span
            className={cn(
              "no-drag group flex h-full min-w-24 flex-1 basis-0 items-center border-border border-r ps-2.5 pe-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:-outline-offset-2",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
              isDragging &&
                "z-10 cursor-grabbing shadow-[0_2px_8px_rgb(0_0_0/0.18)]"
            )}
            data-tab-id={id}
            data-tauri-drag-region={sole || undefined}
            ref={setRefs}
            role="presentation"
            style={{
              // By hand rather than dnd-kit's `CSS` helper, whose export would
              // shadow the global `CSS.escape` the strip uses below.
              transform:
                transform === null
                  ? undefined
                  : `translate3d(${transform.x}px, 0, 0)`,
              transition,
            }}
          />
        }
      >
        {snapshot?.status === "failed" ? (
          <span className="me-1.5 size-1.5 shrink-0 rounded-full bg-destructive">
            <span className="sr-only">
              {snapshot.reason === undefined
                ? "could not save"
                : `could not save: ${snapshot.reason}`}
            </span>
          </span>
        ) : null}
        <button
          aria-controls={tabPanelId(id)}
          aria-selected={active}
          className={cn(
            "min-w-0 flex-1 truncate text-start text-sm focus-visible:outline-none",
            tab.kind === "external" && "font-mono text-xs"
          )}
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
            "ms-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
            active && "opacity-60"
          )}
          data-tab-close
          onClick={close}
          tabIndex={-1}
          type="button"
        >
          <XIcon className={CHROME_GLYPH} />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={close}>close</ContextMenuItem>
        <ContextMenuItem onClick={closeOthers}>close others</ContextMenuItem>
        <ContextMenuItem onClick={closeAfter}>
          close to the right
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={copyPath}>copy path</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface OverflowItemProps {
  label: string;
  tab: Tab;
}

function OverflowItem({ label, tab }: OverflowItemProps) {
  const select = useCallback(() => {
    activateTab(tabId(tab));
  }, [tab]);

  return <DropdownMenuItem onClick={select}>{label}</DropdownMenuItem>;
}

interface OverflowMenuProps {
  hidden: Tab[];
  labelFor: (tab: Tab) => string;
}

/** The tabs the strip has scrolled out of reach. */
function OverflowMenu({ hidden, labelFor }: OverflowMenuProps) {
  if (hidden.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={`${hidden.length} tabs out of view`}
            className="no-drag ms-1 inline-flex h-6 shrink-0 items-center gap-0.5 self-center rounded-md px-1 text-muted-foreground text-xs tabular-nums transition-colors duration-150 hover:bg-muted hover:text-foreground"
            type="button"
          />
        }
      >
        {hidden.length}
        <ChevronDownIcon className={CHROME_GLYPH} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hidden.map((tab) => (
          <OverflowItem key={tabId(tab)} label={labelFor(tab)} tab={tab} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NewNoteButtonProps {
  className: string;
  onNew: () => void;
}

/** The strip's own control: it makes tabs rather than following one. */
function NewNoteButton({ className, onNew }: NewNoteButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label="new note"
            className={cn(
              "inline-flex size-6 shrink-0 select-none items-center justify-center self-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
              className
            )}
            onClick={onNew}
            type="button"
          />
        }
      >
        <PlusIcon className={CHROME_GLYPH} />
      </TooltipTrigger>
      <TooltipContent>new note</TooltipContent>
    </Tooltip>
  );
}

interface TabListProps {
  activeId: string;
  tabs: Tab[];
}

/**
 * The open tabs, in the title bar where the note's title used to sit (`D52`).
 *
 * One tab stop with arrow keys inside it, the `ToggleGroup` pattern `D37` set.
 * Dragging one is dnd-kit's, and `D60` carries why. A lone tab has nowhere to
 * go, so it hands the press to the window instead.
 */
function TabList({ activeId, tabs }: TabListProps) {
  const { data: notes } = useSuspenseQuery(noteQueries.list());
  const listRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const ids = useMemo(() => tabs.map(tabId), [tabs]);
  // No keyboard sensor: it wants the `attributes` spread, which would overwrite
  // the `role="tab"` wiring, and `⌘⌥⇧←/→` already reorders (`D60`).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ACTIVATION_DISTANCE_PX },
    })
  );

  const labelFor = useCallback(
    (tab: Tab) =>
      tab.kind === "external"
        ? (tab.path.split("/").at(-1) ?? tab.path)
        : (notes.find((meta) => meta.path === tab.path)?.title ??
          noteTitle(tab.path)),
    [notes]
  );

  useEffect(() => {
    const list = listRef.current;

    if (list === null) {
      return;
    }

    const measure = () => {
      const open = new Set(ids);

      const next = [...list.querySelectorAll<HTMLElement>("[data-tab-id]")]
        .filter(
          (item) =>
            // Not a rect: a drag transforms a tab out of its slot, and a rect
            // would call it hidden for being mid-slide.
            item.offsetLeft + item.offsetWidth <= list.scrollLeft + 1 ||
            item.offsetLeft >= list.scrollLeft + list.clientWidth - 1
        )
        .map((item) => item.dataset.tabId ?? "")
        // A tab closed between the measurement and this frame still has a
        // node until React commits.
        .filter((id) => open.has(id));

      // Scrolling fires this every frame; only a real change may re-render.
      setHidden((current) =>
        current.length === next.length &&
        current.every((id, at) => id === next[at])
          ? current
          : next
      );
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(list);
    list.addEventListener("scroll", measure);

    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", measure);
    };
  }, [ids]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = STEPS[event.key];

      if (step === undefined) {
        return;
      }

      const target = stepTab({ activeId, tabs }, step);

      if (target === undefined) {
        return;
      }

      event.preventDefault();
      activateTab(tabId(target));
      // Focus follows, or `tabIndex` moves to the new tab while focus stays on
      // the old one and Enter fires whichever button was left behind.
      listRef.current
        ?.querySelector<HTMLElement>(
          `#${CSS.escape(tabButtonId(tabId(target)))}`
        )
        ?.focus();
    },
    [activeId, tabs]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    activateTab(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over === null || active.id === over.id) {
        return;
      }

      moveTab(String(active.id), ids.indexOf(String(over.id)));
    },
    [ids]
  );

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
            className="relative flex min-w-0 flex-1 items-stretch overflow-x-auto"
            onKeyDown={handleKeyDown}
            ref={listRef}
            role="tablist"
          >
            {tabs.map((tab) => (
              <TabItem
                active={tabId(tab) === activeId}
                fallback={labelFor(tab)}
                key={tabId(tab)}
                sole={tabs.length === 1}
                tab={tab}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <OverflowMenu
        hidden={tabs.filter((tab) => hidden.includes(tabId(tab)))}
        labelFor={labelFor}
      />
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
    return <NewNoteButton className="ms-auto" onNew={onNew} />;
  }

  return (
    <div className="flex min-w-0 flex-1 items-stretch self-stretch">
      <TabList activeId={activeId} tabs={tabs} />
      <NewNoteButton className="ms-1" onNew={onNew} />
    </div>
  );
}
