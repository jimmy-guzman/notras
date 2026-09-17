import { useSelector } from "@tanstack/react-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

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
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";

const NOOP = () => {
  // The capture window reads its editor at save time, not on every edit.
};

async function hideCapture(saving: { current: boolean }) {
  try {
    await getCurrentWindow().hide();
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not hide the capture",
      type: "error",
    });
  } finally {
    saving.current = false;
  }
}

/**
 * The quick-capture window: a bare editor. Esc (or ⌘⏎) saves the jot into
 * `inbox/` and hides the window; empty captures are discarded. Escape closes
 * find first when its bar is open.
 */
export function CaptureWindow() {
  const editorRef = useRef<EditorHandle | null>(null);
  const savingRef = useRef<boolean>(false);
  const [session, setSession] = useState(0);
  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [find] = useState(createFindController);
  const findState = useSelector(find.store);
  const [findHandle, setFindHandle] = useState<FindHandle | null>(null);
  useEffect(
    () => (findHandle === null ? undefined : find.bind(findHandle)),
    [find, findHandle]
  );
  useHotkey("Mod+F", find.open, { meta: { name: "find in note" } });

  const saveAndHide = async () => {
    // Esc and ⌘⏎ both land here, and a fast double press would otherwise
    // write the jot twice, with the second copy taking a collision suffix.
    if (savingRef.current) {
      return;
    }

    const content = editorRef.current?.getContent() ?? "";
    savingRef.current = true;
    if (content.trim() !== "") {
      try {
        await createNote({
          content,
          folder: "inbox",
        });
      } catch (error) {
        savingRef.current = false;
        // Keep the jot on screen -- hiding would lose it.
        toast.add({
          description: reasonOf(error),
          title: "could not save the capture",
          type: "error",
        });

        return;
      }
    }
    find.close();
    setSession((current) => current + 1);
    await hideCapture(savingRef);
  };

  const attachEditor = (handle: EditorHandle) => {
    editorRef.current = handle;
    setFindHandle(handle.find);
  };

  useHotkeys([
    {
      callback: () => {
        void saveAndHide();
      },
      hotkey: "Escape",
      options: { enabled: !findState.open },
    },
    {
      callback: () => {
        void saveAndHide();
      },
      hotkey: "Mod+Enter",
    },
  ]);

  return (
    <div className="bg-card text-foreground flex h-svh flex-col">
      <Titlebar />
      <div className="bg-background mx-1 flex min-h-0 flex-1 flex-col rounded-lg p-1">
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
      </div>
      <footer className="text-muted-foreground flex h-8 shrink-0 items-center justify-end gap-1 p-1 text-xs">
        <Chord hotkey="Escape" /> saves to inbox
      </footer>
      {/* This window bypasses the router, so it needs its own Toaster. */}
      <Toaster />
    </div>
  );
}
