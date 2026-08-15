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
import { getNotesDir } from "@/data/notes-dir";

export const Route = createRootRoute({
  component: RootLayout,
  loader: async () => {
    const [notes, folders, notesDir] = await Promise.all([
      getNotes(),
      getFolders(),
      getNotesDir(),
    ]);

    return { folders, notes, notesDir };
  },
});

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

function RootLayout() {
  const { folders, notes, notesDir } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // External writers (AI agents, other editors, the watcher) drive refreshes.
  useEffect(() => {
    const unlisten = listen("notes-changed", () => {
      void router.invalidate();
    });

    return () => {
      void unlisten.then((dispose) => {
        dispose();
      });
    };
  }, [router]);

  // Tray menu + "Open With" plumbing from Rust.
  useEffect(() => {
    const openExternal = (paths: string[]) => {
      const [first] = paths;

      if (first !== undefined) {
        void navigate({ search: { path: first }, to: "/external" });
      }
    };

    const unlistenNew = listen("menu-new-note", () => {
      void createNote().then((path) => {
        return navigate({ params: { _splat: path }, to: "/notes/$" });
      });
    });
    const unlistenOpen = listen<string[]>("open-file", (event) => {
      openExternal(event.payload);
    });

    void invoke<string[]>("pending_open_files").then((paths) => {
      if (paths.length > 0) {
        openExternal(paths);
      }
    });

    return () => {
      void unlistenNew.then((dispose) => {
        dispose();
      });
      void unlistenOpen.then((dispose) => {
        dispose();
      });
    };
  }, [navigate]);

  useHotkeys(
    "mod+k",
    () => {
      setPaletteOpen((current) => {
        return !current;
      });
    },
    HOTKEY_OPTIONS,
  );
  useHotkeys(
    "mod+n",
    () => {
      void createNote()
        .then((path) => {
          return navigate({ params: { _splat: path }, to: "/notes/$" });
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : "could not create note",
          );
        });
    },
    HOTKEY_OPTIONS,
  );
  useHotkeys(
    "mod+comma",
    () => {
      setSettingsOpen(true);
    },
    HOTKEY_OPTIONS,
  );

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col bg-background text-foreground">
        <div
          className="titlebar-drag-region h-9 shrink-0"
          data-tauri-drag-region
        />
        <Outlet />
      </div>
      <CommandPalette
        folders={folders}
        notes={notes}
        notesDir={notesDir}
        onOpenChange={setPaletteOpen}
        onOpenSettings={() => {
          setSettingsOpen(true);
        }}
        open={paletteOpen}
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
