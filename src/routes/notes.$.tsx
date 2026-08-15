import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { EditorHandle } from "@/components/editor/editor";

import { Editor } from "@/components/editor/editor";
import { useAutosave } from "@/components/editor/use-autosave";
import { NoteHeader } from "@/components/notes/note-header";
import { NotePreview } from "@/components/notes/note-preview";
import { StatusBar } from "@/components/notes/status-bar";
import { attachFile } from "@/data/attach-file";
import { getNote } from "@/data/get-note";
import { countWords } from "@/lib/utils/word-count";

export const Route = createFileRoute("/notes/$")({
  component: NotePage,
  loader: ({ params }) => {
    return getNote(params._splat ?? "");
  },
});

const rootApi = getRouteApi("__root__");

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

function usePersistentToggle(key: string, initial = false) {
  const [value, setValue] = useState(() => {
    return localStorage.getItem(key) === null
      ? initial
      : localStorage.getItem(key) === "true";
  });

  const toggle = () => {
    setValue((current) => {
      localStorage.setItem(key, String(!current));

      return !current;
    });
  };

  return [value, toggle] as const;
}

function isImagePath(path: string) {
  return /\.(?:gif|jpe?g|png|svg|webp)$/i.test(path);
}

function NotePage() {
  const note = Route.useLoaderData();

  // Keyed by path so switching notes tears down the whole editing session --
  // autosave state must never leak from one note into another.
  return <NoteEditor key={note.path} note={note} />;
}

interface NoteEditorProps {
  note: Awaited<ReturnType<typeof getNote>>;
}

function NoteEditor({ note }: NoteEditorProps) {
  const { notes, notesDir, syntaxHighlighting } = rootApi.useLoaderData();

  const editorRef = useRef<EditorHandle | null>(null);
  const [content, setContent] = useState(note.content);
  const [words, setWords] = useState(() => {
    return countWords(note.content);
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [focusModeEnabled, toggleFocusMode] = usePersistentToggle("focus-mode");
  const [typewriterEnabled, toggleTypewriter] =
    usePersistentToggle("typewriter");

  // Tracks the mtime of our own writes so loader refreshes can tell an
  // external edit from a stale snapshot of something we just saved.
  const lastSavedAtRef = useRef(note.updatedAt);

  const autosave = useAutosave(note.path, {
    onSaved: (updatedAt) => {
      lastSavedAtRef.current = updatedAt;
    },
  });

  // Live values behind stable getters, so the mount-frozen editor callbacks
  // never go stale.
  const notesRef = useRef(notes);

  useEffect(() => {
    notesRef.current = notes;
  });

  const getTitles = useCallback(() => {
    return notesRef.current.map((meta) => {
      return meta.title;
    });
  }, []);

  const resolveImageSrc = useCallback(
    (src: string) => {
      return src.includes("://") ? src : convertFileSrc(`${notesDir}/${src}`);
    },
    [notesDir],
  );

  const titleToPath = new Map(
    notes.map((meta) => {
      return [meta.title.toLowerCase(), meta.path] as const;
    }),
  );

  // External edits (AI agents, other editors, format-on-blur) flow back in
  // through router invalidation. Reload the buffer only when it is clean AND
  // the file on disk is newer than our own last write -- a stale loader
  // snapshot of a just-saved note must never clobber the buffer.
  useEffect(() => {
    const isExternal =
      note.updatedAt.getTime() > lastSavedAtRef.current.getTime();

    if (autosave.status === "saved" && isExternal && note.content !== content) {
      lastSavedAtRef.current = note.updatedAt;
      setContent(note.content);
      setWords(countWords(note.content));
      setReloadKey((key) => {
        return key + 1;
      });
    }
  }, [autosave.status, content, note.content, note.updatedAt]);

  // Drag a file in -> copy to attachments/, insert a markdown link.
  useEffect(() => {
    const attachDropped = async (paths: string[]) => {
      for (const sourcePath of paths) {
        try {
          const relativePath = await attachFile(sourcePath);
          const name = relativePath.split("/").at(-1) ?? relativePath;
          const link = isImagePath(relativePath)
            ? `![${name}](${relativePath})`
            : `[${name}](${relativePath})`;

          editorRef.current?.insertText(`${link}\n`);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "could not attach file",
          );
        }
      }
    };

    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        void attachDropped(event.payload.paths);
      }
    });

    return () => {
      void unlisten.then((dispose) => {
        dispose();
      });
    };
  }, []);

  useHotkeys(
    "mod+p",
    () => {
      setPreviewEnabled((current) => {
        return !current;
      });
    },
    HOTKEY_OPTIONS,
  );
  useHotkeys("mod+d", toggleFocusMode, HOTKEY_OPTIONS);

  const handleChange = useCallback(
    (nextContent: string) => {
      setContent(nextContent);
      setWords(countWords(nextContent));
      autosave.onChange(nextContent);
    },
    [autosave],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteHeader path={note.path} pinned={note.pinned} tags={note.tags} />
      {previewEnabled ? (
        <NotePreview
          content={content}
          notesDir={notesDir}
          syntaxHighlighting={syntaxHighlighting}
          titleToPath={titleToPath}
        />
      ) : (
        <Editor
          focusModeEnabled={focusModeEnabled}
          focusOnMount
          initialContent={content}
          key={`${note.path}:${reloadKey}`}
          onChange={handleChange}
          onReady={(handle) => {
            editorRef.current = handle;
          }}
          resolveImageSrc={resolveImageSrc}
          titles={getTitles}
          typewriterEnabled={typewriterEnabled}
        />
      )}
      <StatusBar
        focusModeEnabled={focusModeEnabled}
        onToggleFocusMode={toggleFocusMode}
        onTogglePreview={() => {
          setPreviewEnabled((current) => {
            return !current;
          });
        }}
        onToggleTypewriter={toggleTypewriter}
        previewEnabled={previewEnabled}
        status={autosave.status}
        typewriterEnabled={typewriterEnabled}
        words={words}
      />
    </div>
  );
}
