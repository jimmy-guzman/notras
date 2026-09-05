import { useHotkey } from "@tanstack/react-hotkeys";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Navigate,
  Outlet,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { error as logError } from "@tauri-apps/plugin-log";
import { useCallback, useEffect, useState } from "react";
import { CommandPalette, type PaletteMode } from "@/components/command-palette";
import { RouteError } from "@/components/route-error";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster, toast } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createNote } from "@/data/create-note";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { flushPendingWrites } from "@/lib/pending-flush";
import { openNote, openTab, persistTabs } from "@/lib/tabs/store";
import type { PendingOpen } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { findUpdate, offerUpdate, updatesSupported } from "@/lib/updater";

/** Cached data answers the loader; only a cold key fetches. */
const STATIC = "static" as const;

interface RootSearch {
  /** Set by a tag chip to open the palette already filtered to that tag. */
  tag?: string;
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootLayout,
  errorComponent: RootError,
  // The workspace is the only screen (`D53`), so any other path is a stale URL
  // -- a dev reload holding the retired `/notes/$`, or a malformed deep link.
  notFoundComponent: () => <Navigate replace to="/" />,
  validateSearch: (search: Record<string, unknown>): RootSearch =>
    typeof search.tag === "string" ? { tag: search.tag } : {},
  // Priming only: an inactive query is one invalidation cannot reach.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({
        ...noteQueries.folders(),
        staleTime: STATIC,
      }),
      context.queryClient.query({ ...noteQueries.list(), staleTime: STATIC }),
      context.queryClient.query({ ...noteQueries.tags(), staleTime: STATIC }),
      context.queryClient.query({ ...notesDirQuery, staleTime: STATIC }),
    ]);
  },
});

/** `listen` resolves to its own unsubscribe, which every effect here drops. */
function disposeLater(...pending: Promise<() => void>[]) {
  return () => {
    for (const unlisten of pending) {
      const dispose = async () => {
        try {
          (await unlisten)();
        } catch (error) {
          await logError(`could not remove a listener: ${String(error)}`);
        }
      };

      dispose();
    }
  };
}

function RootLayout() {
  const { data: folders } = useSuspenseQuery(noteQueries.folders());
  const { data: notes } = useSuspenseQuery(noteQueries.list());
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  const { data: tags } = useSuspenseQuery(noteQueries.tags());
  const { tag } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paletteMode, setPaletteMode] = useState<PaletteMode>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A tag chip opens the palette without setting a mode, so it lands on find.
  const paletteOpen = paletteMode !== undefined || tag !== undefined;
  const paletteView = paletteMode ?? "find";

  // A tag chip navigates rather than calling up here, so the search param is
  // what opens the palette; clearing it on close keeps the URL from reopening
  // it on the next render.
  const closePalette = useCallback(() => {
    setPaletteMode(undefined);

    if (tag !== undefined) {
      navigate({
        replace: true,
        search: (previous: RootSearch) => ({ ...previous, tag: undefined }),
        to: ".",
      });
    }
  }, [navigate, tag]);

  const handlePaletteOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setPaletteMode("find");

        return;
      }

      closePalette();
    },
    [closePalette]
  );

  // Toggling out of the mode that is showing closes through `closePalette`,
  // which also clears a `?tag=` opening the palette on nobody's mode.
  const togglePaletteMode = useCallback(
    (next: PaletteMode) => {
      if (paletteOpen && paletteView === next) {
        closePalette();

        return;
      }

      setPaletteMode(next);
    },
    [closePalette, paletteOpen, paletteView]
  );

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

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

    checkOnLaunch();
  }, []);

  // External writers (AI agents, other editors, the watcher) drive refreshes.
  // No paths means the whole vault.
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>("notes-changed", (event) => {
      const { paths } = event.payload;

      if (paths.length === 0) {
        queryClient.invalidateQueries({ queryKey: noteQueries.all });

        return;
      }

      queryClient.invalidateQueries({ queryKey: noteQueries.index });

      for (const path of paths) {
        queryClient.invalidateQueries({
          queryKey: noteQueries.fileKey("note", path),
        });
      }
    });

    return disposeLater(unlisten);
  }, [queryClient]);

  // Tray menu + "Open With" plumbing from Rust.
  useEffect(() => {
    // Rust queues every "Open With" path and only signals that the queue has
    // something in it, so draining is the single delivery mechanism. Each one
    // lands in its own tab rather than replacing what is open (`D54`).
    const drainPendingOpens = async () => {
      try {
        const opens = await invoke<PendingOpen[]>("pending_open_files");

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

    const unlistenNew = listen("menu-new-note", async () => {
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
    });
    const unlistenOpen = listen("open-file", () => {
      drainPendingOpens();
    });

    drainPendingOpens();

    return disposeLater(unlistenNew, unlistenOpen);
  }, []);

  // Quit is held open by Rust until the buffers are on disk -- and called off
  // entirely if one of them could not be written.
  useEffect(() => {
    const unlisten = listen("app-quit", async () => {
      // Carets are read off the live sessions, so the set has to be written
      // here rather than only when it last changed. A set that could not be
      // written is no reason to hold the quit, so the flush still runs.
      try {
        persistTabs();
      } catch (error) {
        await logError(`could not persist the tabs: ${String(error)}`);
      }

      try {
        if (await flushPendingWrites()) {
          await invoke("quit_app");

          return;
        }
      } catch {
        // A flush that threw wrote nothing, so the quit is called off below.
      }

      toast.add({
        title: "could not save your changes -- quit cancelled",
        type: "error",
      });
      await invoke("cancel_quit");
    });

    return disposeLater(unlisten);
  }, []);

  useHotkey("Mod+P", () => {
    togglePaletteMode("find");
  });
  // Pressing one while the other shows switches mode rather than closing.
  useHotkey("Mod+Shift+P", () => {
    togglePaletteMode("actions");
  });
  useHotkey(
    "Mod+N",
    async () => {
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
    },
    { meta: { name: "new note" } }
  );
  useHotkey(
    "Mod+,",
    () => {
      setSettingsOpen(true);
    },
    { meta: { name: "settings" } }
  );

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col bg-background text-foreground">
        <Outlet />
      </div>
      <CommandPalette
        allTags={tags}
        folders={folders}
        key={`${tag ?? ""}:${paletteView}`}
        mode={paletteView}
        notes={notes}
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
      <Toaster />
    </TooltipProvider>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const retry = useCallback(() => {
    router.invalidate();
    reset();
  }, [reset, router]);

  return <RouteError reason={reasonOf(error)} retry={retry} />;
}
