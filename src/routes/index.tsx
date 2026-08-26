import {
  createFileRoute,
  getRouteApi,
  useNavigate,
} from "@tanstack/react-router";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { NoteControls } from "@/components/notes/note-controls";
import { StatusBar } from "@/components/notes/status-bar";
import { TabStrip } from "@/components/tabs/tab-strip";
import { Titlebar } from "@/components/titlebar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { NoteSession } from "@/components/workspace/note-session";
import { attachFile } from "@/data/attach-file";
import { createNote } from "@/data/create-note";
import { getNotes } from "@/data/get-notes";
import { togglePref, usePref } from "@/lib/prefs";
import {
  activateTab,
  closeTab,
  getTabSnapshot,
  getTabState,
  moveTab,
  openNote,
  reopenTab,
  restoreTabs,
  useTabSnapshot,
  useTabState,
} from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { stepTab, tabId } from "@/lib/tabs/tab";
import { errorMessage } from "@/lib/ui/failure";

const rootApi = getRouteApi("__root__");

/**
 * Restoring is a launch behaviour, not a refresh one. The loader re-runs on
 * every `notes-changed`, and without this a closed last tab would reopen
 * itself the next time an agent touched the folder.
 */
let seeded = false;

export const Route = createFileRoute("/")({
  component: Workspace,
  loader: async () => {
    if (seeded) {
      return;
    }

    seeded = true;

    // A restored path that no longer reads closes its own tab, so nothing is
    // checked against disk here.
    if (restoreTabs()) {
      return;
    }

    const [latest] = await getNotes({ limit: 1, sort: "updated" });

    if (latest !== undefined) {
      openNote(latest.path);
    }
  },
});

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|svg|webp)$/i;

function attachmentLink(relativePath: string) {
  const name = relativePath.split("/").at(-1) ?? relativePath;

  return IMAGE_EXTENSION.test(relativePath)
    ? `![${name}](${relativePath})`
    : `[${name}](${relativePath})`;
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <h1 className="font-bold font-mono text-5xl tracking-tight">notras</h1>
        <p className="text-muted-foreground">just write, otra vez.</p>
      </div>
      <div className="flex items-center gap-4 text-muted-foreground text-sm">
        <Button onClick={onNew} variant="secondary">
          new note <Kbd>⌘n</Kbd>
        </Button>
        <span>
          or search with <Kbd>⌘k</Kbd>
        </span>
      </div>
    </div>
  );
}

interface ActiveProps {
  /** Absent while no tab is open. */
  tab: Tab | undefined;
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
  const snapshot = useTabSnapshot(tab === undefined ? "" : tabId(tab));

  return (
    <NoteControls
      note={
        tab?.kind === "note"
          ? { path: tab.path, pinned: snapshot?.pinned ?? false }
          : undefined
      }
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
  const snapshot = useTabSnapshot(tab === undefined ? "" : tabId(tab));
  const focusModeEnabled = usePref("focus-mode");
  const typewriterEnabled = usePref("typewriter");

  return (
    <StatusBar
      allTags={allTags}
      focusModeEnabled={focusModeEnabled}
      note={
        tab?.kind === "note"
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
  const { tags } = rootApi.useLoaderData();

  const activeTab = tabs.find((tab) => tabId(tab) === activeId);

  const newNote = useCallback(() => {
    createNote()
      .then((path) => {
        openNote(path, true);
      })
      .catch((error: unknown) => {
        toast.add({
          title: errorMessage(error, "could not create note"),
          type: "error",
        });
      });
  }, []);

  const closeActive = useCallback(() => {
    closeTab(getTabState().activeId);
  }, []);

  const toggleSource = useCallback(() => {
    getTabSnapshot(getTabState().activeId)?.toggleSource();
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
      const target = getTabSnapshot(getTabState().activeId);

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
            title: errorMessage(error, "could not attach file"),
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
      unlisten.then((dispose) => {
        dispose();
      });
    };
  }, []);

  // ⌘9 is the last tab rather than the ninth, which is the macOS convention.
  const jumpToTab = useCallback((event: KeyboardEvent) => {
    const state = getTabState();
    const digit = Number(event.key);
    const target = digit === 9 ? state.tabs.at(-1) : state.tabs[digit - 1];

    if (target !== undefined) {
      activateTab(tabId(target));
    }
  }, []);

  const cycleTab = useCallback((event: KeyboardEvent) => {
    const back = event.shiftKey || event.key === "ArrowLeft";
    const target = stepTab(getTabState(), back ? "previous" : "next");

    if (target !== undefined) {
      activateTab(tabId(target));
    }
  }, []);

  const carryTab = useCallback((event: KeyboardEvent) => {
    const state = getTabState();
    const index = state.tabs.findIndex((tab) => tabId(tab) === state.activeId);

    if (index !== -1) {
      moveTab(state.activeId, index + (event.key === "ArrowLeft" ? -1 : 1));
    }
  }, []);

  useHotkeys("mod+t", newNote, HOTKEY_OPTIONS);
  useHotkeys("mod+w", closeActive, HOTKEY_OPTIONS);
  useHotkeys("mod+shift+t", reopenTab, HOTKEY_OPTIONS);
  useHotkeys("mod+p", toggleSource, HOTKEY_OPTIONS);
  useHotkeys("mod+d", toggleFocusMode, HOTKEY_OPTIONS);
  useHotkeys(
    "mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9",
    jumpToTab,
    HOTKEY_OPTIONS
  );
  useHotkeys(
    "ctrl+tab,ctrl+shift+tab,alt+mod+left,alt+mod+right",
    cycleTab,
    HOTKEY_OPTIONS
  );
  useHotkeys(
    "alt+mod+shift+left,alt+mod+shift+right",
    carryTab,
    HOTKEY_OPTIONS
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <TabStrip activeId={activeId} onNew={newNote} tabs={tabs} />
        <ActiveControls tab={activeTab} />
      </Titlebar>
      {tabs.length === 0 ? (
        <EmptyState onNew={newNote} />
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
      {tabs.length === 0 ? null : (
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
