import { getCurrentWebview } from "@tauri-apps/api/webview";
import { cn } from "cn";
import { PanelLeftIcon, PanelRightIcon, SearchIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePanelRef } from "react-resizable-panels";

import { BarButton } from "@/components/bar-button";
import { FindBar } from "@/components/find-bar";
import { TabGraph } from "@/components/graph/note-graph";
import { NoteBrowser, NoteBrowserModes } from "@/components/notes/note-browser";
import { NOTE_BROWSER_BUTTONS } from "@/components/notes/note-browser-buttons";
import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { attachFile } from "@/data/attach-file";
import { disposeLater } from "@/lib/dispose-later";
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
  NOTE_BROWSER_MAX_WIDTH,
  NOTE_BROWSER_MIN_WIDTH,
  readNoteBrowserWidth,
  rememberNoteBrowserWidth,
  showNoteBrowserMode,
  toggleNoteBrowser,
  useNoteBrowser,
} from "@/lib/ui/note-browser";
import {
  closeNotePanel,
  NOTE_PANEL_MAX_WIDTH,
  NOTE_PANEL_MIN_WIDTH,
  openNotePanel,
  readNotePanelWidth,
  rememberNotePanelWidth,
  toggleNotePanel,
  useNotePanel,
} from "@/lib/ui/note-panel";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";
import { pressView, useGraphMode } from "@/lib/ui/view";
import { attachmentLink } from "@/lib/utils/attachments";

import { CodeSession } from "./code-session";
import { CsvSession } from "./csv-session";
import { Home } from "./home";
import { NotePanel, NotePanelToggles } from "./note-panel";
import { NoteSession } from "./note-session";

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

/** A panel's pixel width from the group's layout, which reports percentages. */
function panelWidth(
  group: HTMLDivElement,
  percentage: number,
  min: number,
  max: number
) {
  const handles = [
    ...group.querySelectorAll<HTMLElement>('[data-slot="resizable-handle"]'),
  ].reduce((sum, handle) => sum + handle.offsetWidth, 0);

  return Math.max(
    min,
    Math.min(
      max,
      Math.round(((group.clientWidth - handles) * percentage) / 100)
    )
  );
}

function BrowserPanels({
  browserBand,
  children,
  notePanel,
  notePanelBand,
  notePanelOpen,
}: {
  /** The browser's button and its modes, in the band above it while it is open. */
  browserBand: ReactNode;
  children: ReactNode;
  notePanel: ReactNode;
  /** The panel's own toggles and its button, in the band above it. */
  notePanelBand: ReactNode;
  notePanelOpen: boolean;
}) {
  const open = useSidebar();
  const browser = usePanelRef();
  const note = usePanelRef();
  const group = useRef<HTMLDivElement>(null);
  const [browserWidth, setBrowserWidth] = useState(readNoteBrowserWidth);
  const [noteWidth, setNoteWidth] = useState(readNotePanelWidth);
  useLayoutEffect(() => {
    const resize = () => {
      browser.current?.resize(open ? browserWidth : 0);
      note.current?.resize(notePanelOpen ? noteWidth : 0);
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
  }, [browser, browserWidth, note, notePanelOpen, noteWidth, open]);

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

        const browserSize = layout["note-browser"];
        const noteSize = layout["note-panel"];

        if (open && browserSize !== undefined) {
          if (browserSize === 0) {
            closeNoteBrowser();
          } else {
            const next = panelWidth(
              group.current,
              browserSize,
              NOTE_BROWSER_MIN_WIDTH,
              NOTE_BROWSER_MAX_WIDTH
            );

            setBrowserWidth(next);
            rememberNoteBrowserWidth(next);
          }
        }

        if (notePanelOpen && noteSize !== undefined) {
          if (noteSize === 0) {
            closeNotePanel();
          } else {
            const next = panelWidth(
              group.current,
              noteSize,
              NOTE_PANEL_MIN_WIDTH,
              NOTE_PANEL_MAX_WIDTH
            );

            setNoteWidth(next);
            rememberNotePanelWidth(next);
          }
        }
      }}
    >
      <ResizablePanel
        id="note-browser"
        collapsedSize={0}
        collapsedThreshold={0}
        collapsible
        defaultSize={browserWidth}
        groupResizeBehavior="preserve-pixel-size"
        maxSize={NOTE_BROWSER_MAX_WIDTH}
        minSize={NOTE_BROWSER_MIN_WIDTH}
        panelRef={browser}
      >
        <div className="flex size-full min-h-0 flex-col">
          {/* `ps-titlebar` clears the traffic lights, which puts the browser's button where it sits while the browser is closed. */}
          <Titlebar>{open ? browserBand : null}</Titlebar>
          <div
            className={cn(
              "flex min-h-0 flex-1 overflow-clip",
              open &&
                "animate-in fade-in-0 slide-in-from-left-8 duration-200 ease-out motion-reduce:animate-none"
            )}
          >
            <NoteBrowser />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle
        aria-label="resize note browser"
        disabled={!open}
        disableDoubleClick
      />
      <ResizablePanel
        id="note-editor"
        minSize={240}
        className="flex min-h-0 flex-col"
      >
        {children}
      </ResizablePanel>
      <ResizableHandle
        aria-label="resize note panel"
        disabled={!notePanelOpen}
        disableDoubleClick
      />
      <ResizablePanel
        id="note-panel"
        collapsedSize={0}
        collapsedThreshold={0}
        collapsible
        defaultSize={notePanelOpen ? noteWidth : 0}
        groupResizeBehavior="preserve-pixel-size"
        maxSize={NOTE_PANEL_MAX_WIDTH}
        minSize={NOTE_PANEL_MIN_WIDTH}
        panelRef={note}
      >
        <div className="flex size-full min-h-0 flex-col">
          <div
            className="text-muted-foreground before:bg-border relative flex h-8 shrink-0 items-center gap-2 p-1 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px"
            data-tauri-drag-region="deep"
          >
            {notePanelOpen ? notePanelBand : null}
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 overflow-clip",
              notePanelOpen &&
                "animate-in fade-in-0 slide-in-from-right-8 duration-200 ease-out motion-reduce:animate-none"
            )}
            hidden={!notePanelOpen}
          >
            {notePanel}
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

    return disposeLater(unlisten);
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
  useHotkeys(
    NOTE_BROWSER_BUTTONS.map(({ hotkey, label, mode }) => ({
      callback: () => {
        showNoteBrowserMode(mode);
      },
      hotkey,
      options: { meta: { name: label } },
    }))
  );
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
      openNotePanel("links");
    },
    // Named for the panel's toggle, the place it opens; the palette's "show
    // links to this note…" row stays in the palette, so it carries no chord.
    { meta: { name: "links" } }
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

  // Every tab kind gets the panel, even one with nothing in it, so switching
  // tabs never moves the tab strip.
  const panelOpen = notePanelOpen && activeTab !== undefined;

  const panelButton = (
    <BarButton
      Icon={PanelRightIcon}
      label="note panel"
      onClick={toggleNotePanel}
      pressed={panelOpen}
    />
  );

  const browseButton = (
    <BarButton
      Icon={PanelLeftIcon}
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
          browserBand={
            <>
              {browseButton}
              <div className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
                <NoteBrowserModes />
              </div>
              <div className="ms-auto">
                <BarButton
                  Icon={SearchIcon}
                  label="find a note"
                  onClick={onOpenSearch}
                />
              </div>
            </>
          }
          notePanel={<NotePanel tab={activeTab} />}
          notePanelBand={
            <>
              {/* Arrives with the panel below it, on the panel's timing. The
                  panel button is not faded: it stays where it was clicked. */}
              <div className="animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
                <NotePanelToggles tab={activeTab} />
              </div>
              <div className="ms-auto">{panelButton}</div>
            </>
          }
          notePanelOpen={panelOpen}
        >
          <Titlebar className={cn(browserOpen && "ps-1!")}>
            {/* Open, each panel's button rides in its band at this same spot. */}
            {browserOpen ? null : browseButton}
            <TabStrip activeId={activeId} tabs={tabs} />
            {activeTab === undefined || panelOpen ? null : (
              <div className="ms-auto">{panelButton}</div>
            )}
          </Titlebar>
          <div className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
            {tabs.length === 0 ? (
              <Home onNew={openDraft} onSearch={onOpenSearch} />
            ) : (
              <>
                <TabJumps />
                {tabs.map((tab) => {
                  if (tab.kind === "csv") {
                    return (
                      <CsvSession
                        active={tab.id === activeId}
                        key={tab.id}
                        tab={tab}
                      />
                    );
                  }

                  if (tab.kind === "code") {
                    return (
                      <CodeSession
                        active={tab.id === activeId}
                        key={tab.id}
                        tab={tab}
                      />
                    );
                  }

                  return tab.id === activeId || hasTabSnapshot(tab.id) ? (
                    <NoteSession
                      active={tab.id === activeId}
                      // The buffer fixes its file kind at mount, so a kind change remounts.
                      key={`${fileKind(tab.kind)}:${tab.id}`}
                      tab={tab}
                    />
                  ) : null;
                })}
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
