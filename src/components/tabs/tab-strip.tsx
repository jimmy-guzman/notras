import { getRouteApi } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { noteTitle } from "@/core/notes";
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
import { cn } from "@/lib/ui/utils";

const rootApi = getRouteApi("__root__");

const STEPS: Record<string, TabStep> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  End: "end",
  Home: "start",
};

interface TabItemProps {
  active: boolean;
  /** Shown until the session publishes a title off its live buffer. */
  fallback: string;
  tab: Tab;
}

function TabItem({ active, fallback, tab }: TabItemProps) {
  const id = tabId(tab);
  const snapshot = useTabSnapshot(id);
  const ref = useRef<HTMLSpanElement>(null);
  const label = snapshot?.title ?? fallback;

  // Keyboard switching can land on a tab that is scrolled out of the strip.
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  const select = useCallback(() => {
    activateTab(id);
  }, [id]);

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
    navigator.clipboard.writeText(tab.path).catch(() => {
      toast.add({ title: "could not copy the path", type: "error" });
    });
  }, [tab.path]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          // Presentational so the tablist reads as holding tabs, with the
          // close button a sibling of the tab rather than a child of it.
          <span
            className={cn(
              "no-drag group flex h-full min-w-24 flex-1 basis-0 items-center border-border border-r ps-2.5 pe-1",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/40"
            )}
            data-tab-id={id}
            ref={ref}
            role="presentation"
          />
        }
      >
        {snapshot?.status === "failed" ? (
          <span className="me-1.5 size-1.5 shrink-0 rounded-full bg-destructive">
            <span className="sr-only">could not save</span>
          </span>
        ) : null}
        <button
          aria-controls={tabPanelId(id)}
          aria-selected={active}
          className={cn(
            "min-w-0 flex-1 truncate text-start text-sm",
            tab.kind === "external" && "font-mono text-xs"
          )}
          id={tabButtonId(id)}
          onClick={select}
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

interface TabStripProps {
  activeId: string;
  onNew: () => void;
  tabs: Tab[];
}

/**
 * The open tabs, in the title bar where the note's title used to sit (`D52`).
 *
 * One tab stop with arrow keys inside it, the `ToggleGroup` pattern `D37` set.
 */
export function TabStrip({ activeId, onNew, tabs }: TabStripProps) {
  const { notes } = rootApi.useLoaderData();
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | {
    captured: boolean;
    id: string;
    pointerId: number;
  }>(null);
  const [hidden, setHidden] = useState<string[]>([]);

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
      const bounds = list.getBoundingClientRect();
      const open = new Set(tabs.map(tabId));

      const next = [...list.querySelectorAll<HTMLElement>("[data-tab-id]")]
        .filter((item) => {
          const rect = item.getBoundingClientRect();

          return rect.right <= bounds.left + 1 || rect.left >= bounds.right - 1;
        })
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
  }, [tabs]);

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

  /**
   * A press selects, which also keeps selection off the click path: a pointer
   * capture retargets the `click` it derives to the capturing element, so an
   * `onClick` inside would not fire once a drag had claimed the pointer.
   */
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    const element = event.target as HTMLElement;
    const id = element.closest<HTMLElement>("[data-tab-id]")?.dataset.tabId;

    // The close button owns its own press.
    if (
      event.button !== 0 ||
      id === undefined ||
      element.closest("[data-tab-close]") !== null
    ) {
      return;
    }

    dragRef.current = { captured: false, id, pointerId: event.pointerId };
    activateTab(id);
  }, []);

  /**
   * Pointer events rather than HTML5 drag, which the titlebar's
   * `-webkit-app-region: drag` intercepts. Capture waits until the press has
   * crossed into another tab: claiming it on the way down takes the close
   * button's click with it.
   */
  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    const list = listRef.current;

    if (drag === null || drag.pointerId !== event.pointerId || list === null) {
      return;
    }

    // A press released outside the strip sends its `pointerup` elsewhere, so
    // the drag would still be armed when the same pointer next hovers through.
    if (event.buttons === 0) {
      dragRef.current = null;

      return;
    }

    const bounds = list.getBoundingClientRect();

    if (event.clientY < bounds.top || event.clientY > bounds.bottom) {
      return;
    }

    const items = [...list.querySelectorAll<HTMLElement>("[data-tab-id]")];
    const over = items.findIndex((item) => {
      const rect = item.getBoundingClientRect();

      return event.clientX >= rect.left && event.clientX <= rect.right;
    });

    if (over === -1 || items[over]?.dataset.tabId === drag.id) {
      return;
    }

    if (!drag.captured) {
      drag.captured = true;
      list.setPointerCapture(event.pointerId);
    }

    moveTab(drag.id, over);
  }, []);

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-stretch self-stretch">
      <div
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        onKeyDown={handleKeyDown}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={listRef}
        role="tablist"
      >
        {tabs.map((tab) => (
          <TabItem
            active={tabId(tab) === activeId}
            fallback={labelFor(tab)}
            key={tabId(tab)}
            tab={tab}
          />
        ))}
      </div>
      <OverflowMenu
        hidden={tabs.filter((tab) => hidden.includes(tabId(tab)))}
        labelFor={labelFor}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label="new note"
              className="ms-1 inline-flex size-6 shrink-0 select-none items-center justify-center self-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              onClick={onNew}
              type="button"
            />
          }
        >
          <PlusIcon className={CHROME_GLYPH} />
        </TooltipTrigger>
        <TooltipContent>new note</TooltipContent>
      </Tooltip>
    </div>
  );
}
