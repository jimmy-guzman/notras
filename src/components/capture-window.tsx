import { useSelector } from "@tanstack/react-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Chord } from "@/components/chord";
import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import type { FindHandle } from "@/components/editor/find";
import { FindBar } from "@/components/find-bar";
import { Titlebar } from "@/components/titlebar";
import { Toaster, toast } from "@/components/ui/toast";
import { createNote } from "@/data/create-note";
import { disposeLater } from "@/lib/dispose-later";
import { reasonOf } from "@/lib/ui/failure";
import { createFindController } from "@/lib/ui/find";
import { useHotkey, useHotkeys } from "@/lib/ui/shortcuts";
import { commands, events } from "@/server/adapters/bindings";
import type { Ending } from "@/server/adapters/bindings";

const NOOP = () => {
  // The capture window reads its editor at save time, not on every edit.
};

async function hideCapture() {
  try {
    await getCurrentWindow().hide();
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not hide the capture",
      type: "error",
    });
  }
}

/**
 * The quick-capture window: a bare editor. Esc, ⌘⏎, the close button and quit
 * save the jot as a new note; empty captures are dropped. ⌘⇧⌫ throws the jot
 * away. Escape and ⌘⇧⌫ leave find to its bar while it is open.
 */
export function CaptureWindow() {
  const editorRef = useRef<EditorHandle | null>(null);
  const busyRef = useRef<Promise<void> | null>(null);
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

  // Esc, ⌘⏎, close and quit all write the jot, and two overlapping runs would
  // write it twice, with the second copy taking a collision suffix.
  const runAlone = async (task: () => Promise<void>) => {
    if (busyRef.current !== null) {
      return;
    }

    busyRef.current = task();
    await busyRef.current;
    busyRef.current = null;
  };

  const resetAndHide = async () => {
    editorRef.current = null;
    find.close();
    setSession((current) => current + 1);
    await hideCapture();
  };

  const saveAndHide = async () => {
    const content = editorRef.current?.getContent() ?? "";

    if (content.trim() !== "") {
      try {
        await createNote({ content });
      } catch (error) {
        // Keep the jot on screen -- hiding would lose it.
        toast.add({
          description: reasonOf(error),
          title: "could not save the capture",
          type: "error",
        });

        return;
      }
    }

    await resetAndHide();
  };

  const saveAndQuit = async (ending: Ending) => {
    const content = editorRef.current?.getContent() ?? "";

    if (content.trim() !== "") {
      try {
        await createNote({ content });
      } catch (error) {
        toast.add(
          ending === "restart"
            ? {
                description: `${reasonOf(error)}, so the update applies on next launch`,
                title: "could not restart into the update",
                type: "error",
              }
            : {
                description: reasonOf(error),
                title: "could not save the capture",
                type: "error",
              }
        );

        // A cancel Rust cannot hear ends in its backstop ending the app with
        // the jot unsaved, so this one failure is said out loud.
        try {
          await commands.cancelQuit();
        } catch (cancelError) {
          toast.add({
            description: reasonOf(cancelError),
            title: "could not cancel the quit",
            type: "error",
          });
        }

        return;
      }
    }

    // Another window can still call the quit off, and a jot left on screen
    // would then be written a second time.
    await resetAndHide();

    // The jot landed and Rust's backstop ends the app either way, so an answer
    // it cannot hear is still safe.
    try {
      await commands.quitApp();
    } catch {
      // See above.
    }
  };

  const onClose = useEffectEvent(() => {
    void runAlone(saveAndHide);
  });

  const onQuit = useEffectEvent(async (ending: Ending) => {
    // A save already running owns the jot; the quit writes what it left.
    await busyRef.current;
    await runAlone(async () => {
      await saveAndQuit(ending);
    });
  });

  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- disposeLater stops both listeners once their promises settle
  useEffect(() => {
    const unlistenClose = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      onClose();
    });

    const unlistenQuit = events.appQuit.listen((event) => {
      void onQuit(event.payload.ending);
    });

    return disposeLater(unlistenClose, unlistenQuit);
  }, []);

  const attachEditor = (handle: EditorHandle) => {
    editorRef.current = handle;
    setFindHandle(handle.find);
  };

  useHotkeys([
    {
      callback: () => {
        void runAlone(saveAndHide);
      },
      hotkey: "Escape",
      options: { enabled: !findState.open },
    },
    {
      callback: () => {
        void runAlone(saveAndHide);
      },
      hotkey: "Mod+Enter",
    },
    {
      callback: () => {
        void runAlone(resetAndHide);
      },
      hotkey: "Mod+Shift+Backspace",
      options: { enabled: !findState.open },
    },
  ]);

  return (
    <div className="bg-shell text-foreground flex h-svh flex-col">
      <Titlebar />
      <div className="bg-background relative mx-1 flex min-h-0 flex-1 flex-col overflow-clip rounded-lg">
        <Editor
          focusOnMount
          initialContent=""
          key={session}
          onChange={NOOP}
          onReady={attachEditor}
          placeholderText="jot it down..."
        />
        <FindBar controller={find} />
      </div>
      <footer className="text-muted-foreground flex h-8 shrink-0 items-center justify-end gap-1 p-1 text-xs">
        <Chord hotkey="Escape" /> saves note
      </footer>
      {/* This window bypasses the router, so it needs its own Toaster. */}
      <Toaster />
    </div>
  );
}
