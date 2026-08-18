import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import { CommandPalette } from "@/components/command-palette";
import { SettingsDialog } from "@/components/settings-dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createNote } from "@/data/create-note";
import { getFolders } from "@/data/get-folders";
import { getNotes } from "@/data/get-notes";
import { getTags } from "@/data/get-tags";
import { getNotesDir } from "@/data/notes-dir";
import { flushPendingWrites } from "@/lib/pending-flush";

interface RootSearch {
  /** Set by a tag chip to open the palette already filtered to that tag. */
  tag?: string;
}

export const Route = createRootRoute({
  component: RootLayout,
  validateSearch: (search: Record<string, unknown>): RootSearch =>
    typeof search.tag === "string" ? { tag: search.tag } : {},
  loader: async () => {
    const [notes, folders, notesDir, tags] = await Promise.all([
      getNotes(),
      getFolders(),
      getNotesDir(),
      getTags(),
    ]);

    return { folders, notes, notesDir, tags };
  },
});

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

function RootLayout() {
  const { folders, notes, notesDir, tags } = Route.useLoaderData();
  const { tag } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // A tag chip navigates rather than calling up here, so the search param is
  // what opens the palette; clearing it on close keeps the URL from reopening
  // it on the next render.
  const closePalette = () => {
    setPaletteOpen(false);

    if (tag !== undefined) {
      navigate({
        replace: true,
        search: (previous: RootSearch) => ({ ...previous, tag: undefined }),
        to: ".",
      });
    }
  };

  // External writers (AI agents, other editors, the watcher) drive refreshes.
  useEffect(() => {
    const unlisten = listen("notes-changed", () => {
      router.invalidate();
    });

    return () => {
      unlisten.then((dispose) => {
        dispose();
      });
    };
  }, [router]);

  // Tray menu + "Open With" plumbing from Rust.
  useEffect(() => {
    // Rust queues every "Open With" path and only signals that the queue has
    // something in it, so draining is the single delivery mechanism.
    const drainPendingOpens = async () => {
      const paths = await invoke<string[]>("pending_open_files");
      const [first, ...rest] = paths;

      if (first === undefined) {
        return;
      }

      await navigate({ search: { path: first }, to: "/external" });

      // The queue is drained destructively and there is one window to show a
      // file in, so say what was left behind rather than dropping it silently.
      if (rest.length > 0) {
        toast.warning(
          `opened 1 file; ${rest.length} more were not opened -- notras shows one at a time`
        );
      }
    };

    const reportFailure = (fallback: string) => (error: unknown) => {
      toast.error(error instanceof Error ? error.message : fallback);
    };

    const unlistenNew = listen("menu-new-note", () => {
      createNote()
        .then((path) => navigate({ params: { _splat: path }, to: "/notes/$" }))
        .catch(reportFailure("could not create note"));
    });
    const unlistenOpen = listen("open-file", () => {
      drainPendingOpens().catch(reportFailure("could not open file"));
    });

    drainPendingOpens().catch(reportFailure("could not open file"));

    return () => {
      unlistenNew.then((dispose) => {
        dispose();
      });
      unlistenOpen.then((dispose) => {
        dispose();
      });
    };
  }, [navigate]);

  // Quit is held open by Rust until the buffers are on disk -- and called off
  // entirely if one of them could not be written.
  useEffect(() => {
    const unlisten = listen("app-quit", () => {
      flushPendingWrites()
        .then((saved) => {
          if (saved) {
            return invoke("quit_app");
          }

          toast.error("could not save your changes -- quit cancelled");

          return invoke("cancel_quit");
        })
        .catch(() => {
          toast.error("could not save your changes -- quit cancelled");

          return invoke("cancel_quit");
        });
    });

    return () => {
      unlisten.then((dispose) => {
        dispose();
      });
    };
  }, []);

  useHotkeys(
    "mod+k",
    () => {
      setPaletteOpen((current) => !current);
    },
    HOTKEY_OPTIONS
  );
  useHotkeys(
    "mod+n",
    () => {
      createNote()
        .then((path) => navigate({ params: { _splat: path }, to: "/notes/$" }))
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : "could not create note"
          );
        });
    },
    HOTKEY_OPTIONS
  );
  useHotkeys(
    "mod+comma",
    () => {
      setSettingsOpen(true);
    },
    HOTKEY_OPTIONS
  );

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col bg-background text-foreground">
        <Outlet />
      </div>
      <CommandPalette
        allTags={tags}
        folders={folders}
        key={tag ?? "palette"}
        notes={notes}
        notesDir={notesDir}
        onOpenChange={(next) => {
          if (next) {
            setPaletteOpen(true);

            return;
          }

          closePalette();
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
        }}
        open={paletteOpen || tag !== undefined}
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
