import { getCurrentWindow } from "@tauri-apps/api/window";
import { format } from "date-fns";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { EditorHandle } from "@/components/editor/editor";

import { Editor } from "@/components/editor/editor";
import { Titlebar } from "@/components/titlebar";
import { Kbd } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/sonner";
import { createNote } from "@/data/create-note";

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

/**
 * The quick-capture window: a bare editor. Esc (or ⌘⏎) saves the jot into
 * `inbox/` and hides the window; empty captures are discarded.
 */
export function CaptureWindow() {
  const editorRef = useRef<EditorHandle | null>(null);
  const savingRef = useRef(false);
  const [session, setSession] = useState(0);

  const saveAndHide = async () => {
    // Esc and ⌘⏎ both land here, and a fast double press would otherwise
    // write the jot twice (the timestamp title collides and dedupes to -2).
    if (savingRef.current) {
      return;
    }

    const content = editorRef.current?.getContent() ?? "";

    if (content.trim() !== "") {
      savingRef.current = true;

      try {
        await createNote({
          content,
          folder: "inbox",
          title: format(new Date(), "yyyy-MM-dd-HHmmss"),
        });
      } catch (error) {
        // Keep the jot on screen -- hiding would lose it.
        toast.error(
          error instanceof Error ? error.message : "could not save the capture",
        );

        return;
      } finally {
        savingRef.current = false;
      }
    }

    setSession((current) => {
      return current + 1;
    });
    await getCurrentWindow().hide();
  };

  useHotkeys(
    "esc, mod+enter",
    () => {
      void saveAndHide();
    },
    HOTKEY_OPTIONS,
  );

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <Titlebar />
      <Editor
        focusOnMount
        initialContent=""
        key={session}
        onChange={() => {
          return undefined;
        }}
        onReady={(handle) => {
          editorRef.current = handle;
        }}
        placeholderText="jot it down..."
      />
      <footer className="flex h-7 shrink-0 items-center justify-end gap-2 border-t px-3 text-xs text-muted-foreground">
        <Kbd>esc</Kbd> saves to inbox
      </footer>
      {/* This window bypasses the router, so it needs its own Toaster. */}
      <Toaster />
    </div>
  );
}
