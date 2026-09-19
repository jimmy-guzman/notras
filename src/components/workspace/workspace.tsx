import { useQuery } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { error as logError } from "@tauri-apps/plugin-log";
import { SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { BarButton } from "@/components/bar-button";
import { Chord } from "@/components/chord";
import { FindBar } from "@/components/find-bar";
import { TabGraph } from "@/components/graph/note-graph";
import { StatusBar } from "@/components/notes/status-bar";
import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { NoteSession } from "@/components/workspace/note-session";
import { attachFile } from "@/data/attach-file";
import { createNote } from "@/data/create-note";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries } from "@/data/queries";
import { toggleFocusMode, useFocusMode } from "@/lib/prefs";
import {
  activateTab,
  changeNoteMetadata,
  closeOtherTabs,
  closeTab,
  getTabHandles,
  getTabState,
  moveTab,
  openNote,
  reopenTab,
  useTabSnapshot,
  useTabState,
} from "@/lib/tabs/store";
import type { Tab, TabState } from "@/lib/tabs/tab";
import { stepTab } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { noteFind, openNoteFind } from "@/lib/ui/find";
import { toggleGraph, useGraphMode } from "@/lib/ui/graph";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";
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

function Welcome({
  onNew,
  onSearch,
}: {
  onNew: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex items-center gap-7">
        <picture className="shrink-0">
          <source
            media="(prefers-color-scheme: light)"
            srcSet="/logo-light.svg"
          />
          <img
            alt=""
            className="size-28"
            height={112}
            src="/logo-dark.svg"
            width={112}
          />
        </picture>
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="tracking-wordmark font-sans text-5xl leading-none font-semibold">
              notras
            </h1>
            <p className="text-muted-foreground leading-tagline text-xl tracking-tight">
              write another note
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onNew}>
              new note <Chord hotkey="Mod+N" />
            </Button>
            <Button onClick={onSearch} variant="secondary">
              search <Chord hotkey="Mod+P" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentNote({ initialTabs }: { initialTabs: TabState }) {
  const latest = useQuery({
    ...noteQueries.list({ limit: 1, sort: "updated" }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const opened = useRef(false);
  useEffect(() => {
    if (latest.isSuccess && !opened.current) {
      opened.current = true;
      const [note] = latest.data;
      if (note !== undefined && getTabState() === initialTabs) {
        openNote(note.path);
      }
    }
  }, [initialTabs, latest.data, latest.isSuccess]);
  const indexStatus = useQuery(indexStatusQuery);
  const retry = async () => {
    await latest.refetch();
  };
  if (latest.isSuccess) {
    return null;
  }
  if (latest.isError) {
    return (
      <output className="block p-3 text-center text-sm">
        <span className="block">could not open the recent note</span>
        <span className="block">{reasonOf(latest.error)}</span>
        <Button
          onClick={() => {
            void retry();
          }}
          size="sm"
          variant="ghost"
        >
          retry
        </Button>
      </output>
    );
  }
  return (
    <output className="text-muted-foreground block p-3 text-center text-xs">
      {indexStatus.data?.state === "scanning"
        ? "indexing notes..."
        : "loading recent note..."}
    </output>
  );
}

interface ActiveStatusBarProps {
  graphEnabled: boolean;
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleGraph: () => void;
  onToggleSource: () => void;
  tab: Tab;
}

function ActiveStatusBar({
  graphEnabled,
  onFilterTag,
  onToggleFocusMode,
  onToggleGraph,
  onToggleSource,
  tab,
}: ActiveStatusBarProps) {
  const snapshot = useTabSnapshot(tab.id);
  const focusModeEnabled = useFocusMode();

  return (
    <StatusBar
      focusModeEnabled={focusModeEnabled}
      graphEnabled={graphEnabled}
      note={
        tab.kind === "note"
          ? { path: tab.path, tags: snapshot?.tags ?? [] }
          : undefined
      }
      onFilterTag={onFilterTag}
      onToggleFocusMode={onToggleFocusMode}
      onToggleGraph={onToggleGraph}
      onToggleSource={onToggleSource}
      sourceEnabled={snapshot?.sourceMode ?? false}
      words={snapshot?.words ?? 0}
    />
  );
}

async function newNote() {
  try {
    const path = await createNote();

    openNote(path, true);
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not create note",
      type: "error",
    });
  }
}

function closeActive() {
  closeTab(getTabState().activeId);
}

function closeOthers() {
  closeOtherTabs(getTabState().activeId);
}

function toggleSource() {
  getTabHandles(getTabState().activeId)?.toggleSource();
}

function toggleGraphView() {
  const state = getTabState();
  const tab = state.tabs.find((entry) => entry.id === state.activeId);

  if (tab?.kind === "note") {
    toggleGraph(state.activeId);
  }
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
 * The window: the tab strip, every open tab's live session, and the two bands
 * that frame them.
 *
 * Every session stays mounted, so anything that listens to the window or the
 * keyboard belongs here rather than inside one of them. Registered N times it
 * would fire N times, and a dropped file would land in every open note.
 */
export function Workspace({
  initialTabs,
  onFilterTag,
  onOpenSearch,
}: {
  /** The tab state at launch, or null when saved tabs were restored into it. */
  initialTabs: TabState | null;
  onFilterTag: (tag: string) => void;
  onOpenSearch: () => void;
}) {
  const tabState = useTabState();
  const { activeId, tabs } = tabState;

  const activeTab = tabs.find((tab) => tab.id === activeId);
  const graphMode = useGraphMode(activeId);

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
          title: "no editor to insert the attachment into",
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

    return () => {
      const dispose = async () => {
        try {
          (await unlisten)();
        } catch (error) {
          try {
            await logError(`could not remove a listener: ${String(error)}`);
          } catch {
            // Best effort.
          }
        }
      };

      void dispose();
    };
  }, []);

  useHotkey(
    "Mod+T",
    () => {
      void newNote();
    },
    { meta: { name: "new note" } }
  );
  useHotkey("Mod+W", closeActive, { meta: { name: "close tab" } });
  useHotkey("Mod+Alt+Shift+W", closeOthers, {
    meta: { name: "close other tabs" },
  });
  useHotkey("Mod+Shift+T", reopenTab, {
    meta: { name: "reopen last closed tab" },
  });
  useHotkey("Mod+E", toggleSource, { meta: { name: "markdown source" } });
  useHotkey("Mod+Alt+G", toggleGraphView, {
    meta: { name: "graph view" },
  });
  useHotkey("Mod+F", openNoteFind, { meta: { name: "find in note" } });
  useHotkey("Mod+D", toggleFocusMode, { meta: { name: "focus mode" } });
  useHotkey(
    "Mod+Shift+D",
    () => {
      void togglePinned();
    },
    { meta: { name: "pin" } }
  );
  useHotkeys(
    TAB_JUMPS.map(([hotkey, index]) => ({
      callback: () => {
        jumpToTab(index);
      },
      hotkey,
    }))
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

  return (
    <div className="bg-shell flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <TabStrip
          activeId={activeId}
          onNew={() => {
            void newNote();
          }}
          tabs={tabs}
        />
        <BarButton
          Icon={SearchIcon}
          label="find a note"
          onClick={onOpenSearch}
        />
      </Titlebar>
      <div className="bg-background relative mx-1 flex min-h-0 flex-1 flex-col overflow-clip rounded-lg last:mb-1">
        {tabs.length === 0 ? (
          <>
            <Welcome
              onNew={() => {
                void newNote();
              }}
              onSearch={onOpenSearch}
            />
            {tabState === initialTabs ? (
              <RecentNote initialTabs={initialTabs} />
            ) : null}
          </>
        ) : (
          <>
            {tabs.map((tab) => (
              <NoteSession
                active={tab.id === activeId}
                key={tab.id}
                tab={tab}
              />
            ))}
            {/* Unkeyed on purpose: a hop swaps the tab under it, and one instance is what lets the pills glide. */}
            {activeTab?.kind === "note" && graphMode ? (
              <TabGraph tab={activeTab} />
            ) : null}
            <FindBar controller={noteFind} />
          </>
        )}
      </div>
      {activeTab === undefined ? null : (
        <ActiveStatusBar
          graphEnabled={graphMode}
          onFilterTag={onFilterTag}
          onToggleFocusMode={toggleFocusMode}
          onToggleGraph={toggleGraphView}
          onToggleSource={toggleSource}
          tab={activeTab}
        />
      )}
    </div>
  );
}
