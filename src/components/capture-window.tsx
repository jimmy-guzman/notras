import { useHotkey, useHotkeys } from "@tanstack/react-hotkeys";
import { useSelector } from "@tanstack/react-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chord } from "@/components/chord";
import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import type { FindHandle } from "@/components/editor/find";
import { FindBar } from "@/components/find-bar";
import { Titlebar } from "@/components/titlebar";
import { Toaster, toast } from "@/components/ui/toast";
import { createNote } from "@/data/create-note";
import { reasonOf } from "@/lib/ui/failure";
import { createFindController } from "@/lib/ui/find";

const NOOP = () => undefined;

/**
 * The quick-capture window: a bare editor. Esc (or ⌘⏎) saves the jot into
 * `inbox/` and hides the window; empty captures are discarded. Escape closes
 * find first when its bar is open.
 */
export function CaptureWindow() {
  const editorRef = useRef<EditorHandle | null>(null);
  const savingRef = useRef<boolean>(false);
  const [session, setSession] = useState(0);
  const [find] = useState(createFindController);
  const findState = useSelector(find.store);
  const [findHandle, setFindHandle] = useState<FindHandle | null>(null);
  useEffect(() => {
    if (findHandle !== null) {
      return find.bind(findHandle);
    }
  }, [find, findHandle]);
  useHotkey("Mod+F", find.open, { meta: { name: "find in note" } });

  const saveAndHide = async () => {
    // Esc and ⌘⏎ both land here, and a fast double press would otherwise
    // write the jot twice (the timestamp title collides and dedupes to -2).
    // biome-ignore lint/suspicious/noUnnecessaryConditions: the asynchronous save sets this ref while a second shortcut can read it
    if (savingRef.current) {
      return;
    }

    const content = editorRef.current?.getContent() ?? "";

    if (content.trim() !== "") {
      savingRef.current = true;

      try {
        await createNote({
          content,
          filename: format(new Date(), "yyyy-MM-dd-HHmmss"),
          folder: "inbox",
        });
      } catch (error) {
        // Keep the jot on screen -- hiding would lose it.
        toast.add({
          description: reasonOf(error),
          title: "could not save the capture",
          type: "error",
        });

        return;
      } finally {
        savingRef.current = false;
      }
    }

    find.close();
    setSession((current) => current + 1);
    await getCurrentWindow().hide();
  };

  const attachEditor = useCallback((handle: EditorHandle) => {
    editorRef.current = handle;
    setFindHandle(handle.find);
  }, []);

  useHotkeys([
    {
      callback: saveAndHide,
      hotkey: "Escape",
      options: { enabled: !findState.open },
    },
    { callback: saveAndHide, hotkey: "Mod+Enter" },
  ]);

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <Titlebar />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Editor
          findOpen={findState.open}
          focusOnMount
          initialContent=""
          key={session}
          onChange={NOOP}
          onReady={attachEditor}
          placeholderText="jot it down..."
        />
        <FindBar controller={find} />
      </div>
      <footer className="flex h-7 shrink-0 items-center justify-end gap-2 border-t px-3 text-muted-foreground text-xs">
        <Chord hotkey="Escape" /> saves to inbox
      </footer>
      {/* This window bypasses the router, so it needs its own Toaster. */}
      <Toaster />
    </div>
  );
}
