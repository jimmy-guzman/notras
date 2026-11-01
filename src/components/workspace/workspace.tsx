import { getCurrentWebview } from "@tauri-apps/api/webview";
import { error as logError } from "@tauri-apps/plugin-log";
import { cn } from "cn";
import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";

import { BarButton } from "@/components/bar-button";
import { FindBar } from "@/components/find-bar";
import { TabGraph } from "@/components/graph/note-graph";
import { NoteBrowser } from "@/components/notes/note-browser";
import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { Home } from "@/components/workspace/home";
import { NotePanel, NotePanelToggles } from "@/components/workspace/note-panel";
import { NoteSession } from "@/components/workspace/note-session";
import { attachFile } from "@/data/attach-file";
import {
  activateTab,
  changeNoteMetadata,
  closeOtherTabs,
  closeTab,
  getTabHandles,
  getTabState,
  hasTabSnapshot,
  moveTab,
  openDraft,
  reopenTab,
  useTabState,
} from "@/lib/tabs/store";
import { fileKind, stepTab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { noteFind, openNoteFind } from "@/lib/ui/find";
import {
  closeNoteBrowser,
  readNoteBrowserWidth,
  rememberNoteBrowserWidth,
  toggleNoteBrowser,
  useNoteBrowser,
} from "@/lib/ui/note-browser";
import {
  closeNotePanel,
  openNotePanel,
  readNotePanelWidth,
  rememberNotePanelWidth,
  toggleNotePanel,
  useNotePanel,
} from "@/lib/ui/note-panel";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";
import { pressView, useGraphMode } from "@/lib/ui/view";
import { attachmentLink } from "@/lib/utils/attachments";

/** ⌘9 is the last tab rather than the ninth, which is the macOS convention. */
const TAB_JUMPS = [
  ["Mod+1", 0],
  ["Mod+2", 1],
  ["Mod+3", 2],
  ["Mod+4", 3],
  ["Mod+5", 4],
  ["Mod+6", 5],
  ["Mod+7", 6],
  ["Mod+8", 7],
  ["Mod+9", -1],
] as const;

function closeActive() {
  closeTab(getTabState().activeId);
}

function closeOthers() {
  closeOtherTabs(getTabState().activeId);
}

function pressSource() {
  pressView(getTabState().activeId, "source");
}

function pressGraph() {
  pressView(getTabState().activeId, "graph");
}

async function togglePinned() {
  const state = getTabState();
  const tab = state.tabs.find((entry) => entry.id === state.activeId);

  if (tab?.kind !== "note") {
    return;
  }

  try {
    await changeNoteMetadata(tab.path, ({ pinned }) => ({ pinned: !pinned }));
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not update pin",
      type: "error",
    });
  }
}

function jumpToTab(index: number) {
  const target = getTabState().tabs.at(index);

  if (target !== undefined) {
    activateTab(target.id);
  }
}

function cycleTab(direction: "next" | "previous") {
  const target = stepTab(getTabState(), direction);

  if (target !== undefined) {
    activateTab(target.id);
  }
}

function carryTab(offset: number) {
  const state = getTabState();
  const index = state.tabs.findIndex((tab) => tab.id === state.activeId);

  if (index !== -1) {
    moveTab(state.activeId, index + offset);
  }
}

/**
 * Mounted only beside open tabs, so home's rows hold the same chords alone. A
 * child's cleanup runs before the next child registers, in both directions;
 * a conditional list in the parent's own hook would register home's rows
 * first and draw the manager's warning on every close of the last tab.
 */
function TabJumps() {
  useHotkeys(
    TAB_JUMPS.map(([hotkey, index]) => ({
      callback: () => {
        jumpToTab(index);
      },
      hotkey,
    }))
  );

  return null;
}

const PANEL_MIN = 200;
const PANEL_MAX = 480;

/** A panel's pixel width from the group's layout, which reports percentages. */
function panelWidth(group: HTMLDivElement, percentage: number) {
  const handles = [
    ...group.querySelectorAll<HTMLElement>('[data-slot="resizable-handle"]'),
  ].reduce((sum, handle) => sum + handle.offsetWidth, 0);

  return Math.max(
    PANEL_MIN,
    Math.min(
      PANEL_MAX,
      Math.round(((group.clientWidth - handles) * percentage) / 100)
    )
  );
}

function BrowserPanels({
  children,
  left,
  leftBand,
  leftOpen,
  rightBand,
}: {
  children: ReactNode;
  left: ReactNode;
  /** The panel's button and its own toggles, in the band above it. */
  leftBand: ReactNode;
  leftOpen: boolean;
  /** The browser's button, in the band above it while it is open. */
  rightBand: ReactNode;
}) {
  const open = useSidebar();
  const panel = usePanelRef();
  const leftPanel = usePanelRef();
  const group = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(readNoteBrowserWidth);
  const [leftWidth, setLeftWidth] = useState(readNotePanelWidth);
  useLayoutEffect(() => {
    const resize = () => {
      panel.current?.resize(open ? width : 0);
      leftPanel.current?.resize(leftOpen ? leftWidth : 0);
    };

    resize();
    let frame = 0;

    const observer = new ResizeObserver(() => {
      // The panel group must update its pixel constraints before restoring the saved width.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });

    if (group.current !== null) {
      observer.observe(group.current);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [leftOpen, leftPanel, leftWidth, open, panel, width]);

  return (
    <ResizablePanelGroup
      // Self-only, so only what the panels and handles leave uncovered moves
      // the window.
      data-tauri-drag-region
      elementRef={group}
      orientation="horizontal"
      onLayoutChanged={(layout, { isUserInteraction }) => {
        if (!isUserInteraction || group.current === null) {
          return;
        }

        const browser = layout["note-browser"];
        const note = layout["note-panel"];

        if (open && browser !== undefined) {
          if (browser === 0) {
            closeNoteBrowser();
          } else {
            const next = panelWidth(group.current, browser);
            setWidth(next);
            rememberNoteBrowserWidth(next);
          }
        }

        if (leftOpen && note !== undefined) {
          if (note === 0) {
            closeNotePanel();
          } else {
            const next = panelWidth(group.current, note);
            setLeftWidth(next);
            rememberNotePanelWidth(next);
          }
        }
      }}
    >
      <ResizablePanel
        id="note-panel"
        collapsedSize={0}
        collapsedThreshold={0}
        collapsible
        defaultSize={leftOpen ? leftWidth : 0}
        groupResizeBehavior="preserve-pixel-size"
        maxSize={PANEL_MAX}
        minSize={PANEL_MIN}
        panelRef={leftPanel}
      >
        <div className="flex size-full min-h-0 flex-col">
          {/* `ps-titlebar` clears the traffic lights, which puts the panel's button where it sits while the panel is closed. */}
          <div
            className="text-muted-foreground ps-titlebar flex h-8 shrink-0 items-center gap-2 py-1 pe-1"
            data-tauri-drag-region="deep"
          >
            {leftOpen ? leftBand : null}
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 overflow-clip rounded-t-lg",
              leftOpen &&
                "animate-in fade-in-0 slide-in-from-left-8 duration-200 ease-out motion-reduce:animate-none"
            )}
            hidden={!leftOpen}
          >
            {left}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle
        aria-label="resize note panel"
        disabled={!leftOpen}
        disableDoubleClick
        hidden={!leftOpen}
        titleBand
      />
      <ResizablePanel
        id="note-editor"
        minSize={240}
        className="flex min-h-0 flex-col"
      >
        {children}
      </ResizablePanel>
      <ResizableHandle
        aria-label="resize note browser"
        disabled={!open}
        disableDoubleClick
        hidden={!open}
        titleBand
      />
      <ResizablePanel
        id="note-browser"
        collapsedSize={0}
        collapsedThreshold={0}
        collapsible
        defaultSize={width}
        minSize={200}
        maxSize={480}
        groupResizeBehavior="preserve-pixel-size"
        panelRef={panel}
      >
        <div className="flex size-full min-h-0 flex-col">
          {/* Not `Titlebar`: its traffic-light inset would give the collapsed panel 88px of content it cannot fit. */}
          <div
            className="text-muted-foreground flex h-8 shrink-0 items-center justify-end py-1 pe-1"
            data-tauri-drag-region="deep"
          >
            {open ? rightBand : null}
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 overflow-clip rounded-t-lg",
              open &&
                "animate-in fade-in-0 slide-in-from-right-8 duration-200 ease-out motion-reduce:animate-none"
            )}
          >
            <NoteBrowser />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/**
 * The window: the title bar, every open tab's live session, and the browser
 * beside them.
 *
 * Every session stays mounted, so anything that listens to the window or the
 * keyboard belongs here rather than inside one of them. Registered N times it
 * would fire N times, and a dropped file would land in every open note.
 */
export function Workspace({ onOpenSearch }: { onOpenSearch: () => void }) {
  const browserOpen = useNoteBrowser();
  const { activeId, tabs } = useTabState();

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const graphMode = useGraphMode(activeId);
  const notePanelOpen = useNotePanel().open;

  // Drag a file in -> copy to attachments/, insert a markdown link into
  // whichever tab is showing.
  useEffect(() => {
    const attachDropped = async (paths: string[]) => {
      const state = getTabState();
      const target = getTabHandles(state.activeId);
      const showing = state.tabs.find((entry) => entry.id === state.activeId);

      if (showing?.kind === "external") {
        toast.add({
          description: "Attachments live in the notes folder",
          title: "could not attach file",
          type: "error",
        });

        return;
      }

      const from = showing?.path ?? "";

      if (target === undefined) {
        toast.add({
          description: "No editor is showing",
          title: "could not attach file",
          type: "error",
        });

        return;
      }

      const copies = await Promise.allSettled(
        paths.map(async (sourcePath) => await attachFile(sourcePath))
      );

      for (const copy of copies) {
        if (copy.status === "fulfilled") {
          target.insertText(attachmentLink(copy.value, from));
        } else {
          const error: unknown = copy.reason;

          toast.add({
            description: reasonOf(error),
            title: "could not attach file",
            type: "error",
          });
        }
      }
    };

    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void attachDropped(event.payload.paths);
      }
    });

    const dispose = async () => {
      try {
        (await unlisten)();
      } catch (error) {
        try {
          await logError(`could not remove a listener: ${String(error)}`);
        } catch {
          // A logging failure must not reject the cleanup promise.
        }
      }
    };

    return () => {
      void dispose();
    };
  }, []);

  useHotkey("Mod+W", closeActive, { meta: { name: "close tab" } });
  useHotkey("Mod+Alt+Shift+W", closeOthers, {
    meta: { name: "close other tabs" },
  });
  useHotkey("Mod+Shift+T", reopenTab, {
    meta: { name: "reopen last closed tab" },
  });
  useHotkey("Mod+E", pressSource, { meta: { name: "markdown source" } });
  useHotkey("Mod+Alt+G", pressGraph, { meta: { name: "graph view" } });
  useHotkey("Mod+F", openNoteFind, { meta: { name: "find in note" } });
  useHotkey("Mod+\\", toggleNoteBrowser, { meta: { name: "browse notes" } });
  // The browser's chord with Shift, for the panel on the other side.
  useHotkey("Mod+Shift+\\", toggleNotePanel, {
    meta: { name: "note panel" },
  });
  useHotkey(
    "Mod+Shift+H",
    () => {
      openNotePanel("outline");
    },
    { meta: { name: "outline" } }
  );
  useHotkey(
    "Mod+Shift+L",
    () => {
      openNotePanel("mentions");
    },
    // Named for the panel's toggle, the place it opens; the palette's "show
    // mentions..." row stays in the palette, so it carries no chord.
    { meta: { name: "mentions" } }
  );
  useHotkey(
    "Mod+Shift+Y",
    () => {
      openNotePanel("tags");
    },
    { meta: { name: "tags" } }
  );
  useHotkey(
    "Mod+Shift+D",
    () => {
      void togglePinned();
    },
    { meta: { name: "pin" } }
  );
  useHotkeys([
    {
      callback: () => {
        cycleTab("next");
      },
      hotkey: "Control+Tab",
    },
    {
      callback: () => {
        cycleTab("previous");
      },
      hotkey: "Control+Shift+Tab",
    },
    {
      callback: () => {
        cycleTab("next");
      },
      hotkey: "Mod+Alt+ArrowRight",
    },
    {
      callback: () => {
        cycleTab("previous");
      },
      hotkey: "Mod+Alt+ArrowLeft",
    },
  ]);
  useHotkeys([
    {
      callback: () => {
        carryTab(-1);
      },
      hotkey: "Mod+Alt+Shift+ArrowLeft",
    },
    {
      callback: () => {
        carryTab(1);
      },
      hotkey: "Mod+Alt+Shift+ArrowRight",
    },
  ]);

  const leftOpen = notePanelOpen && activeTab !== undefined;

  const panelButton = (
    <BarButton
      Icon={PanelLeftIcon}
      label="note panel"
      onClick={toggleNotePanel}
      pressed={leftOpen}
    />
  );

  const browseButton = (
    <BarButton
      Icon={PanelRightIcon}
      label="browse notes"
      onClick={toggleNoteBrowser}
      pressed={browserOpen}
    />
  );

  return (
    <div className="bg-shell flex min-h-0 flex-1 flex-col">
      <SidebarProvider
        open={browserOpen}
        className="relative min-h-0 flex-1 overflow-clip"
      >
        <BrowserPanels
          left={<NotePanel tab={activeTab} />}
          leftBand={
            <>
              {panelButton}
              {/* Arrives with the card below it, on the card's timing. The
                  panel button is not faded: it stays where it was clicked. */}
              <div className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
                <NotePanelToggles tab={activeTab} />
              </div>
            </>
          }
          leftOpen={leftOpen}
          rightBand={browseButton}
        >
          <Titlebar
            // Open, the browser's card corner ends the bar, and the last tab's
            // foot clears its 8px radius.
            className={cn(leftOpen && "ps-1!", browserOpen && "pe-3")}
          >
            {/* Open, each panel's button rides in its band at this same spot. */}
            {activeTab === undefined || leftOpen ? null : panelButton}
            <TabStrip activeId={activeId} tabs={tabs} />
            {browserOpen ? null : <div className="ms-auto">{browseButton}</div>}
          </Titlebar>
          <div className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-t-lg">
            {tabs.length === 0 ? (
              <Home onNew={openDraft} onSearch={onOpenSearch} />
            ) : (
              <>
                <TabJumps />
                {tabs.map((tab) =>
                  tab.id === activeId || hasTabSnapshot(tab.id) ? (
                    <NoteSession
                      active={tab.id === activeId}
                      // The buffer fixes its file kind at mount, so a kind change remounts.
                      key={`${fileKind(tab.kind)}:${tab.id}`}
                      tab={tab}
                    />
                  ) : null
                )}
                {/* Unkeyed on purpose: a hop swaps the tab under it, and one instance is what lets the pills glide. */}
                {activeTab?.kind === "note" && graphMode ? (
                  <TabGraph tab={activeTab} />
                ) : null}
                <FindBar controller={noteFind} />
              </>
            )}
          </div>
        </BrowserPanels>
      </SidebarProvider>
    </div>
  );
}
