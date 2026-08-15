import {
  createFileRoute,
  getRouteApi,
  useNavigate,
} from "@tanstack/react-router";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { EditorHandle } from "@/components/editor/editor";
import type { SourceEditorHandle } from "@/components/editor/source-editor";

import { Editor } from "@/components/editor/editor";
import {
  getMarkdownBlockOffsets,
  offsetToBlockIndex,
} from "@/components/editor/source-anchors";
import { SourceEditor } from "@/components/editor/source-editor";
import { useAutosave } from "@/components/editor/use-autosave";
import { NoteHeader } from "@/components/notes/note-header";
import { StatusBar } from "@/components/notes/status-bar";
import { composeNote, parseNote } from "@/core";
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
  const { notes, notesDir } = rootApi.useLoaderData();
  const navigate = useNavigate();

  const editorRef = useRef<EditorHandle | null>(null);
  // The rich editor owns the BODY; frontmatter rides along from the latest
  // loader snapshot so pin/tag toggles are never clobbered by a body save.
  // State drives renders (source mode); the ref feeds the mount-frozen
  // editor callbacks.
  const [frontmatterLines, setFrontmatterLines] = useState(() => {
    return parseNote(note.content).rawLines;
  });
  const frontmatterRef = useRef(frontmatterLines);

  useEffect(() => {
    frontmatterRef.current = frontmatterLines;
  });

  // Frontmatter follows the loader (adjust-during-render pattern): a pin or
  // tag toggle rewrites the file, and the next body save must compose with
  // that fresh block, not the one captured at mount.
  const [syncedContent, setSyncedContent] = useState(note.content);

  if (syncedContent !== note.content) {
    setSyncedContent(note.content);

    const fresh = parseNote(note.content).rawLines;

    if (fresh.join("\n") !== frontmatterLines.join("\n")) {
      setFrontmatterLines(fresh);
    }
  }

  const [body, setBody] = useState(() => {
    return parseNote(note.content).body;
  });
  const bodyRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  });
  const [words, setWords] = useState(() => {
    return countWords(note.content);
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const sourceRef = useRef<null | SourceEditorHandle>(null);
  // Anchors carried across mode toggles so the caret keeps its block.
  const [sourceCursor, setSourceCursor] = useState(0);
  const pendingRichBlockRef = useRef<null | number>(null);
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

  const openWikilink = useCallback(
    (title: string) => {
      const target = notesRef.current.find((meta) => {
        return meta.title.toLowerCase() === title.toLowerCase();
      });

      if (target === undefined) {
        toast.error(`no note named "${title.toLowerCase()}"`);

        return;
      }

      void navigate({ params: { _splat: target.path }, to: "/notes/$" });
    },
    [navigate],
  );

  // External edits (AI agents, other editors) flow back in through router
  // invalidation. Frontmatter always follows the loader; the body buffer
  // reloads only when it is clean AND the file on disk is newer than our
  // own last write -- a stale loader snapshot of a just-saved note must
  // never clobber the buffer.
  useEffect(() => {
    const parsed = parseNote(note.content);

    const isExternal =
      note.updatedAt.getTime() > lastSavedAtRef.current.getTime();

    if (autosave.status === "saved" && isExternal && parsed.body !== body) {
      lastSavedAtRef.current = note.updatedAt;
      setBody(parsed.body);
      setWords(countWords(note.content));
      setReloadKey((key) => {
        return key + 1;
      });
    }
  }, [autosave.status, body, note.content, note.updatedAt]);

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

          editorRef.current?.insertText(link);
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

  const handleBodyChange = useCallback(
    (nextBody: string) => {
      const full = composeNote(frontmatterRef.current, nextBody);

      setBody(nextBody);
      setWords(countWords(full));
      autosave.onChange(full);
    },
    [autosave],
  );

  const handleSourceChange = (raw: string) => {
    const parsed = parseNote(raw);

    setFrontmatterLines(parsed.rawLines);
    setBody(parsed.body);
    setWords(countWords(raw));
    autosave.onChange(raw);
  };

  // The raw file's first block is the frontmatter fence when present;
  // body block indexes shift by one in the source view.
  const toggleSourceMode = () => {
    const skew = frontmatterRef.current.length > 0 ? 1 : 0;

    setSourceMode((current) => {
      if (current) {
        // Source -> rich: land the caret on the block it was in.
        const raw = composeNote(frontmatterRef.current, bodyRef.current);
        const offsets = getMarkdownBlockOffsets(raw);
        const offset = sourceRef.current?.getCursorOffset() ?? 0;

        pendingRichBlockRef.current = Math.max(
          0,
          offsetToBlockIndex(offsets, offset) - skew,
        );
        setReloadKey((key) => {
          return key + 1;
        });
      } else {
        // Rich -> source: open at the caret's block.
        const raw = composeNote(frontmatterRef.current, bodyRef.current);
        const offsets = getMarkdownBlockOffsets(raw);
        const blockIndex =
          (editorRef.current?.getCursorBlockIndex() ?? 0) + skew;

        setSourceCursor(offsets[blockIndex] ?? raw.length);
      }

      return !current;
    });
  };

  useHotkeys("mod+p", toggleSourceMode, HOTKEY_OPTIONS);
  useHotkeys("mod+d", toggleFocusMode, HOTKEY_OPTIONS);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NoteHeader path={note.path} pinned={note.pinned} tags={note.tags} />
      {sourceMode ? (
        <SourceEditor
          initialCursor={sourceCursor}
          initialValue={composeNote(frontmatterLines, body)}
          key={`${note.path}:${reloadKey}:source`}
          onChange={handleSourceChange}
          onReady={(handle) => {
            sourceRef.current = handle;
          }}
        />
      ) : (
        <Editor
          focusModeEnabled={focusModeEnabled}
          focusOnMount
          initialContent={body}
          key={`${note.path}:${reloadKey}`}
          onChange={handleBodyChange}
          onReady={(handle) => {
            editorRef.current = handle;

            const pending = pendingRichBlockRef.current;

            if (pending !== null) {
              pendingRichBlockRef.current = null;
              handle.setCursorToBlock(pending);
            }
          }}
          onWikilinkClick={openWikilink}
          resolveImageSrc={resolveImageSrc}
          titles={getTitles}
          typewriterEnabled={typewriterEnabled}
        />
      )}
      <StatusBar
        focusModeEnabled={focusModeEnabled}
        onToggleFocusMode={toggleFocusMode}
        onToggleSource={toggleSourceMode}
        onToggleTypewriter={toggleTypewriter}
        sourceEnabled={sourceMode}
        status={autosave.status}
        typewriterEnabled={typewriterEnabled}
        words={words}
      />
    </div>
  );
}
