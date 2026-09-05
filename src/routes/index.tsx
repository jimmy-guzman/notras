import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { error as logError } from "@tauri-apps/plugin-log";
import { useCallback, useEffect } from "react";
import { Chord } from "@/components/chord";
import { NoteControls } from "@/components/notes/note-controls";
import { StatusBar } from "@/components/notes/status-bar";
import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { NoteSession } from "@/components/workspace/note-session";
import { attachFile } from "@/data/attach-file";
import { createNote } from "@/data/create-note";
import { getNotes } from "@/data/get-notes";
import { noteQueries } from "@/data/queries";
import { togglePref, usePref } from "@/lib/prefs";
import {
  activateTab,
  adoptVaultNotes,
  closeOtherTabs,
  closeTab,
  getTabHandles,
  getTabState,
  moveTab,
  openNote,
  reopenTab,
  restoreTabs,
  useTabSnapshot,
  useTabState,
} from "@/lib/tabs/store";
import type { PendingOpen, Tab } from "@/lib/tabs/tab";
import { stepTab, tabId } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { attachmentLink } from "@/lib/utils/attachments";

/**
 * Restoring is a launch behaviour. Anything that re-runs the loader afterwards
 * must not reopen a tab the user closed.
 */
let seeded = false;

export const Route = createFileRoute("/")({
  component: Workspace,
  loader: async () => {
    if (seeded) {
      return;
    }

    // A restored path that no longer reads closes its own tab, so nothing is
    // checked against disk here.
    if (restoreTabs()) {
      await adoptVaultNotes((paths) =>
        invoke<PendingOpen[]>("classify_open_paths", { paths })
      );
    } else {
      const [latest] = await getNotes({ limit: 1, sort: "updated" });

      if (latest !== undefined) {
        openNote(latest.path);
      }
    }

    seeded = true;
  },
});

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

function Welcome({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <h1 className="font-bold font-mono text-5xl tracking-tight">notras</h1>
        <p className="text-muted-foreground">write another note.</p>
      </div>
      <div className="flex items-center gap-4 text-muted-foreground text-sm">
        <Button onClick={onNew} variant="outline">
          new note <Chord hotkey="Mod+N" />
        </Button>
        <span>
          or search with <Chord hotkey="Mod+P" />
        </span>
      </div>
    </div>
  );
}

interface ActiveProps {
  tab: Tab;
}

/**
 * The chrome that follows the active tab's live state.
 *
 * These subscribe to the snapshot themselves rather than taking it from the
 * workspace. Read one level up, a keystroke would re-render the workspace and
 * with it every mounted session, so the cost of typing would scale with the
 * number of open tabs.
 */
function ActiveControls({ tab }: ActiveProps) {
  const snapshot = useTabSnapshot(tabId(tab));

  return (
    <NoteControls
      note={
        tab.kind === "note"
          ? { path: tab.path, pinned: snapshot?.pinned ?? false }
          : undefined
      }
      reason={snapshot?.reason}
      status={snapshot?.status ?? "saved"}
    />
  );
}

interface ActiveStatusBarProps extends ActiveProps {
  allTags: { count: number; tag: string }[];
  onFilterTag: (tag: string) => void;
  onToggleFocusMode: () => void;
  onToggleSource: () => void;
  onToggleTypewriter: () => void;
}

function ActiveStatusBar({
  allTags,
  onFilterTag,
  onToggleFocusMode,
  onToggleSource,
  onToggleTypewriter,
  tab,
}: ActiveStatusBarProps) {
  const snapshot = useTabSnapshot(tabId(tab));
  const focusModeEnabled = usePref("focus-mode");
  const typewriterEnabled = usePref("typewriter");

  return (
    <StatusBar
      allTags={allTags}
      focusModeEnabled={focusModeEnabled}
      note={
        tab.kind === "note"
          ? { path: tab.path, tags: snapshot?.tags ?? [] }
          : undefined
      }
      onFilterTag={onFilterTag}
      onToggleFocusMode={onToggleFocusMode}
      onToggleSource={onToggleSource}
      onToggleTypewriter={onToggleTypewriter}
      sourceEnabled={snapshot?.sourceMode ?? false}
      typewriterEnabled={typewriterEnabled}
      words={snapshot?.words ?? 0}
    />
  );
}

/**
 * The window: the tab strip, every open tab's live session, and the two bands
 * that frame them.
 *
 * Every session stays mounted, so anything that listens to the window or the
 * keyboard belongs here rather than inside one of them. Registered N times it
 * would fire N times, and a dropped file would land in every open note.
 */
function Workspace() {
  const { activeId, tabs } = useTabState();
  const navigate = useNavigate();
  const { data: tags } = useSuspenseQuery(noteQueries.tags());

  const activeTab = tabs.find((tab) => tabId(tab) === activeId);

  const newNote = useCallback(async () => {
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
  }, []);

  const closeActive = useCallback(() => {
    closeTab(getTabState().activeId);
  }, []);

  const closeOthers = useCallback(() => {
    closeOtherTabs(getTabState().activeId);
  }, []);

  const toggleSource = useCallback(() => {
    getTabHandles(getTabState().activeId)?.toggleSource();
  }, []);

  const toggleFocusMode = useCallback(() => {
    togglePref("focus-mode");
  }, []);

  const toggleTypewriter = useCallback(() => {
    togglePref("typewriter");
  }, []);

  const filterByTag = useCallback(
    (tag: string) => {
      navigate({ search: { tag }, to: "." });
    },
    [navigate]
  );

  // Drag a file in -> copy to attachments/, insert a markdown link into
  // whichever tab is showing.
  useEffect(() => {
    const attachDropped = async (paths: string[]) => {
      const target = getTabHandles(getTabState().activeId);

      if (target === undefined) {
        toast.add({
          title: "no editor to insert the attachment into",
          type: "error",
        });

        return;
      }

      const copies = await Promise.allSettled(
        paths.map((sourcePath) => attachFile(sourcePath))
      );

      for (const copy of copies) {
        if (copy.status === "fulfilled") {
          target.insertText(attachmentLink(copy.value));
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
        attachDropped(event.payload.paths);
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

      dispose();
    };
  }, []);

  const jumpToTab = useCallback((index: number) => {
    const target = getTabState().tabs.at(index);

    if (target !== undefined) {
      activateTab(tabId(target));
    }
  }, []);

  const cycleTab = useCallback((direction: "next" | "previous") => {
    const target = stepTab(getTabState(), direction);

    if (target !== undefined) {
      activateTab(tabId(target));
    }
  }, []);

  const carryTab = useCallback((offset: number) => {
    const state = getTabState();
    const index = state.tabs.findIndex((tab) => tabId(tab) === state.activeId);

    if (index !== -1) {
      moveTab(state.activeId, index + offset);
    }
  }, []);

  useHotkey("Mod+T", newNote, { meta: { name: "new note" } });
  useHotkey("Mod+W", closeActive, { meta: { name: "close tab" } });
  useHotkey("Mod+Alt+Shift+W", closeOthers, {
    meta: { name: "close other tabs" },
  });
  useHotkey("Mod+Shift+T", reopenTab, {
    meta: { name: "reopen last closed tab" },
  });
  useHotkey("Mod+E", toggleSource, { meta: { name: "markdown source" } });
  useHotkey("Mod+D", toggleFocusMode, { meta: { name: "focus mode" } });
  useHotkey("Mod+Alt+T", toggleTypewriter, {
    meta: { name: "typewriter scrolling" },
  });
  useHotkeys(
    TAB_JUMPS.map(([hotkey, index]) => ({
      callback: () => jumpToTab(index),
      hotkey,
    }))
  );
  useHotkeys([
    { callback: () => cycleTab("next"), hotkey: "Control+Tab" },
    { callback: () => cycleTab("previous"), hotkey: "Control+Shift+Tab" },
    { callback: () => cycleTab("next"), hotkey: "Mod+Alt+ArrowRight" },
    { callback: () => cycleTab("previous"), hotkey: "Mod+Alt+ArrowLeft" },
  ]);
  useHotkeys([
    { callback: () => carryTab(-1), hotkey: "Mod+Alt+Shift+ArrowLeft" },
    { callback: () => carryTab(1), hotkey: "Mod+Alt+Shift+ArrowRight" },
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <TabStrip activeId={activeId} onNew={newNote} tabs={tabs} />
        {activeTab === undefined ? null : <ActiveControls tab={activeTab} />}
      </Titlebar>
      {tabs.length === 0 ? (
        <Welcome onNew={newNote} />
      ) : (
        <div className="relative min-h-0 flex-1">
          {tabs.map((tab) => (
            <NoteSession
              active={tabId(tab) === activeId}
              key={tabId(tab)}
              tab={tab}
            />
          ))}
        </div>
      )}
      {activeTab === undefined ? null : (
        <ActiveStatusBar
          allTags={tags}
          onFilterTag={filterByTag}
          onToggleFocusMode={toggleFocusMode}
          onToggleSource={toggleSource}
          onToggleTypewriter={toggleTypewriter}
          tab={activeTab}
        />
      )}
    </div>
  );
}
