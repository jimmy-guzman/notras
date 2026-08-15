import { getCurrentWindow } from "@tauri-apps/api/window";
import { format } from "date-fns";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { EditorHandle } from "@/components/editor/editor";

import { Editor } from "@/components/editor/editor";
import { Kbd } from "@/components/ui/kbd";
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
  const [session, setSession] = useState(0);

  const saveAndHide = async () => {
    const content = editorRef.current?.getContent() ?? "";

    if (content.trim() !== "") {
      await createNote({
        content,
        folder: "inbox",
        title: format(new Date(), "yyyy-MM-dd-HHmmss"),
      });
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
      <div
        className="titlebar-drag-region h-8 shrink-0"
        data-tauri-drag-region
      />
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
      <footer className="flex h-8 shrink-0 items-center justify-end gap-2 border-t px-3 text-xs text-muted-foreground">
        <Kbd>esc</Kbd> saves to inbox
      </footer>
    </div>
  );
}
