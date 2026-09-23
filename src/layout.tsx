import {
  QueryErrorResetBoundary,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { error as logError } from "@tauri-apps/plugin-log";
import { Suspense, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { FallbackProps } from "react-error-boundary";

import { CommandPalette } from "@/components/command-palette";
import type { PaletteMode } from "@/components/command-palette";
import { SettingsDialog } from "@/components/settings-dialog";
import { toast } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceError } from "@/components/workspace-error";
import { Workspace } from "@/components/workspace/workspace";
import { applyIndexStatus } from "@/data/index-status";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { startupQuery } from "@/data/restore-session";
import { flushPendingWrites } from "@/lib/pending-flush";
import { openDraft, openTab, persistTabs, refreshTabs } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";
import { useHotkey } from "@/lib/ui/shortcuts";
import { findUpdate, offerUpdate, updatesSupported } from "@/lib/updater";
import { commands, events } from "@/server/adapters/bindings";

/** `listen` resolves to its own unsubscribe, which every effect here drops. */
function disposeLater(...pending: Promise<() => void>[]) {
  return () => {
    for (const unlisten of pending) {
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
    }
  };
}

function MainWindow() {
  const [{ data: notesDir }, { data: initialTabs }] = useSuspenseQueries({
    queries: [notesDirQuery, startupQuery],
  });
  const [tag, setTag] = useState<string>();
  const queryClient = useQueryClient();
  const [paletteSession, setPaletteSession] = useState(0);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A tag chip opens the palette without setting a mode, so it lands on find.
  const paletteOpen = paletteMode !== undefined || tag !== undefined;
  const paletteView = paletteMode ?? "find";

  const closePalette = () => {
    setPaletteMode(undefined);
    setTag(undefined);
  };

  const handlePaletteOpenChange = (next: boolean) => {
    if (next) {
      setPaletteSession((session) => session + 1);
      setPaletteMode("find");

      return;
    }

    closePalette();
  };

  // Toggling out of the mode that is showing closes through `closePalette`,
  // which also clears a tag opening the palette on nobody's mode.
  const togglePaletteMode = (next: PaletteMode) => {
    if (paletteOpen && paletteView === next) {
      closePalette();

      return;
    }

    setPaletteSession((session) => session + 1);
    setPaletteMode(next);
  };

  const openSettings = () => {
    setSettingsOpen(true);
  };

  // One check per launch. Silent when there is nothing to install and silent
  // when the check itself fails: a launch is the wrong moment to interrupt
  // someone over a network blip, and the palette offers a check that reports.
  useEffect(() => {
    const checkOnLaunch = async () => {
      if (!updatesSupported()) {
        return;
      }

      try {
        const update = await findUpdate();

        if (update !== null) {
          offerUpdate(update);
        }
      } catch {
        // Deliberately quiet; see above.
      }
    };

    void checkOnLaunch();
  }, []);

  // External writers (AI agents, other editors, the watcher) drive refreshes.
  // No paths means the whole vault.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- disposeLater stops both listeners once their promises settle
  useEffect(() => {
    const unlisten = events.notesChanged.listen((event) => {
      const { paths } = event.payload;

      if (paths.length === 0) {
        void queryClient.invalidateQueries({ queryKey: noteQueries.all });
        refreshTabs(() => true);

        return;
      }

      void queryClient.invalidateQueries({ queryKey: noteQueries.index });
      const changed = new Set(paths);
      refreshTabs((tab) => tab.kind === "note" && changed.has(tab.path));
    });

    const unlistenStatus = events.indexStatus.listen((event) => {
      void applyIndexStatus(queryClient, event.payload);
    });

    return disposeLater(unlisten, unlistenStatus);
  }, [queryClient]);

  // The watcher covers only the notes folder, so an external file is re-read
  // whenever the window comes back, in case another app changed it meanwhile.
  useEffect(() => {
    const refreshExternal = () => {
      refreshTabs((tab) => tab.kind === "external");
    };
    window.addEventListener("focus", refreshExternal);
    return () => {
      window.removeEventListener("focus", refreshExternal);
    };
  }, []);

  // Tray menu + "Open With" plumbing from Rust.
  useEffect(() => {
    // Rust queues every "Open With" path and only signals that the queue has
    // something in it, so draining is the single delivery mechanism. Each one
    // lands in its own tab rather than replacing what is open (`D54`).
    const drainPendingOpens = async () => {
      try {
        const opens = await commands.pendingOpenFiles();

        for (const { kind, path } of opens) {
          openTab(kind, path, true);
        }
      } catch (error) {
        toast.add({
          description: reasonOf(error),
          title: "could not open file",
          type: "error",
        });
      }
    };

    const unlistenNew = listen("menu-new-note", openDraft);
    const unlistenOpen = listen("open-file", () => {
      void drainPendingOpens();
    });

    void drainPendingOpens();

    return disposeLater(unlistenNew, unlistenOpen);
  }, []);

  // Quit is held open by Rust until the buffers are on disk -- and called off
  // entirely if one of them could not be written.
  useEffect(() => {
    const persistBeforeQuit = async () => {
      // Carets are read off the live sessions, so the set has to be written
      // here rather than only when it last changed. One that could not be
      // written is no reason to hold the quit.
      try {
        persistTabs();
      } catch (error) {
        try {
          await logError(`could not persist the tabs: ${String(error)}`);
        } catch {
          // Best effort.
        }
      }

      if (await flushPendingWrites()) {
        // Every buffer landed and Rust's backstop exits either way, so an answer
        // it cannot hear is still safe, and a log line would travel the channel
        // that just failed.
        try {
          await commands.quitApp();
        } catch {
          // See above.
        }

        return;
      }

      toast.add({
        description: "Quit cancelled",
        title: "could not save your changes",
        type: "error",
      });

      // A cancel Rust cannot hear ends in its backstop exiting with the buffer
      // unsaved, so this one failure is said out loud.
      try {
        await commands.cancelQuit();
      } catch (error) {
        toast.add({
          description: reasonOf(error),
          title: "could not cancel the quit",
          type: "error",
        });
      }
    };

    const unlisten = listen("app-quit", () => {
      void persistBeforeQuit();
    });

    return disposeLater(unlisten);
  }, []);

  useHotkey(
    "Mod+P",
    () => {
      togglePaletteMode("find");
    },
    { meta: { name: "find a note" } }
  );
  // Pressing one while the other shows switches mode rather than closing.
  useHotkey("Mod+Shift+P", () => {
    togglePaletteMode("actions");
  });
  useHotkey("Mod+N", openDraft, { meta: { name: "new note" } });
  useHotkey(
    "Mod+,",
    () => {
      setSettingsOpen(true);
    },
    { meta: { name: "settings" } }
  );

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-svh flex-col">
        <Workspace
          initialTabs={initialTabs}
          onFilterTag={setTag}
          onOpenSearch={() => {
            handlePaletteOpenChange(true);
          }}
        />
      </div>
      <CommandPalette
        key={`${tag ?? ""}:${paletteView}:${paletteSession}`}
        mode={paletteView}
        notesDir={notesDir}
        onOpenChange={handlePaletteOpenChange}
        onOpenSettings={openSettings}
        open={paletteOpen}
        tag={tag}
      />
      <SettingsDialog
        key={notesDir}
        notesDir={notesDir}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
      />
    </TooltipProvider>
  );
}

function renderWorkspaceError({ error, resetErrorBoundary }: FallbackProps) {
  return <WorkspaceError reason={reasonOf(error)} retry={resetErrorBoundary} />;
}

export function Layout() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary fallbackRender={renderWorkspaceError} onReset={reset}>
          <Suspense fallback={null}>
            <MainWindow />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
