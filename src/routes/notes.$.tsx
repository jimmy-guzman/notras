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
import { Editor } from "@/components/editor/editor";
import { insertSentinel } from "@/components/editor/sentinel";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";
import { useAutosave } from "@/components/editor/use-autosave";
import { NoteHeader } from "@/components/notes/note-header";
import { StatusBar } from "@/components/notes/status-bar";
import { Titlebar } from "@/components/titlebar";
import {
  composeNote,
  noteFolder,
  noteTitle,
  parseNote,
  resolveTitle,
} from "@/core";
import { attachFile } from "@/data/attach-file";
import { getNote } from "@/data/get-note";
import { countWords } from "@/lib/utils/word-count";

export const Route = createFileRoute("/notes/$")({
  component: NotePage,
  loader: ({ params }) => getNote(params._splat ?? ""),
});

const rootApi = getRouteApi("__root__");

const HOTKEY_OPTIONS = {
  enableOnContentEditable: true,
  enableOnFormTags: true,
  preventDefault: true,
} as const;

function usePersistentToggle(key: string, initial = false) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);

    return stored === null ? initial : stored === "true";
  });

  // The next value is computed outside the updater: React may call an updater
  // more than once, so it has to stay free of side effects.
  const toggle = () => {
    const next = !value;

    localStorage.setItem(key, String(next));
    setValue(next);
  };

  return [value, toggle] as const;
}

const IMAGE_EXTENSION = /\.(?:gif|jpe?g|png|svg|webp)$/i;

function isImagePath(path: string) {
  return IMAGE_EXTENSION.test(path);
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
  const { notes, notesDir, tags } = rootApi.useLoaderData();
  const navigate = useNavigate();

  const editorRef = useRef<EditorHandle | null>(null);
  // The rich editor owns the BODY; frontmatter rides along from the latest
  // loader snapshot so pin/tag toggles are never clobbered by a body save.
  // State drives renders (source mode); the ref feeds the mount-frozen
  // editor callbacks.
  const [frontmatterLines, setFrontmatterLines] = useState(
    () => parseNote(note.content).rawLines
  );
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

  const [body, setBody] = useState(() => parseNote(note.content).body);
  const bodyRef = useRef(body);

  // `D32`'s chain, resolved off the live buffer rather than the loader, so the
  // titlebar follows a heading as it is typed. The body already re-renders this
  // component on every change, so nothing extra is scheduled here.
  const title = resolveTitle(
    note.path,
    body,
    parseNote(composeNote(frontmatterLines, "")).frontmatter.title
  );

  useEffect(() => {
    bodyRef.current = body;
  });
  const [words, setWords] = useState(() => countWords(note.content));
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const sourceRef = useRef<null | SourceEditorHandle>(null);
  const sourceModeRef = useRef(sourceMode);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  });
  // Anchors carried across mode toggles so the caret keeps its spot.
  const [sourceCursor, setSourceCursor] = useState(0);
  // Body carrying a sentinel char at the caret (set when leaving source
  // mode); the rich editor strips it after mount and places the caret.
  const [sentineledBody, setSentineledBody] = useState<null | string>(null);
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
  // Stable across renders, unlike `autosave` itself (a fresh object every
  // render, since `status` changes on every keystroke).
  const { onChange } = autosave;

  // Live values behind stable getters, so the mount-frozen editor callbacks
  // never go stale.
  const notesRef = useRef(notes);

  useEffect(() => {
    notesRef.current = notes;
  });

  const getTitles = useCallback(
    () => notesRef.current.map((meta) => meta.title),
    []
  );

  const resolveImageSrc = useCallback(
    (src: string) =>
      src.includes("://") ? src : convertFileSrc(`${notesDir}/${src}`),
    [notesDir]
  );

  // Resolution is by title, then by filename stem. `D32` decoupled the two, so
  // a title is no longer unique and links written against a filename have to
  // keep working. Ties break by nearest folder, then by path.
  const openWikilink = useCallback(
    (title: string) => {
      const wanted = title.trim().toLowerCase();
      const currentFolder = noteFolder(note.path);
      const candidates = notesRef.current
        .filter(
          (meta) =>
            meta.title.toLowerCase() === wanted ||
            noteTitle(meta.path).toLowerCase() === wanted
        )
        .toSorted((left, right) => {
          const byTitle =
            Number(right.title.toLowerCase() === wanted) -
            Number(left.title.toLowerCase() === wanted);
          const byFolder =
            Number(noteFolder(right.path) === currentFolder) -
            Number(noteFolder(left.path) === currentFolder);

          return byTitle || byFolder || left.path.localeCompare(right.path);
        });
      const target = candidates.at(0);

      if (target === undefined) {
        toast.error(`no note named "${wanted}"`);

        return;
      }

      navigate({ params: { _splat: target.path }, to: "/notes/$" });
    },
    [navigate, note.path]
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
      setSentineledBody(null);
      setReloadKey((key) => key + 1);
    }
  }, [autosave.status, body, note.content, note.updatedAt]);

  // Drag a file in -> copy to attachments/, insert a markdown link.
  useEffect(() => {
    const attachDropped = async (paths: string[]) => {
      for (const sourcePath of paths) {
        try {
          // Whichever surface is live owns the caret; the other one's handle
          // is stale (it was torn down by the mode toggle).
          const target = sourceModeRef.current
            ? sourceRef.current
            : editorRef.current;

          if (target === null) {
            throw new Error("no editor to insert the attachment into");
          }

          const relativePath = await attachFile(sourcePath);
          const name = relativePath.split("/").at(-1) ?? relativePath;
          const link = isImagePath(relativePath)
            ? `![${name}](${relativePath})`
            : `[${name}](${relativePath})`;

          target.insertText(link);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "could not attach file"
          );
        }
      }
    };

    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        attachDropped(event.payload.paths);
      }
    });

    return () => {
      unlisten.then((dispose) => {
        dispose();
      });
    };
  }, []);

  const handleBodyChange = useCallback(
    (nextBody: string) => {
      const full = composeNote(frontmatterRef.current, nextBody);

      setBody(nextBody);
      setWords(countWords(full));
      onChange(full);
    },
    [onChange]
  );

  const handleSourceChange = (raw: string) => {
    const parsed = parseNote(raw);

    setFrontmatterLines(parsed.rawLines);
    setBody(parsed.body);
    setWords(countWords(raw));
    autosave.onChange(raw);
  };

  // The caret rides through the markdown converters as a sentinel, so the
  // mapping between the two surfaces is exact (see sentinel.ts).
  const toggleSourceMode = () => {
    const raw = composeNote(frontmatterRef.current, bodyRef.current);
    const prefixLength = raw.length - bodyRef.current.length;

    if (sourceMode) {
      const offset = sourceRef.current?.getCursorOffset() ?? 0;
      const bodyOffset = Math.max(
        0,
        Math.min(offset - prefixLength, bodyRef.current.length)
      );

      setSentineledBody(insertSentinel(bodyRef.current, bodyOffset));
      setReloadKey((key) => key + 1);
    } else {
      const offset = editorRef.current?.getCaretSourceOffset() ?? -1;

      setSourceCursor(offset === -1 ? raw.length : prefixLength + offset);
    }

    setSourceMode(!sourceMode);
  };

  useHotkeys("mod+p", toggleSourceMode, HOTKEY_OPTIONS);
  useHotkeys("mod+d", toggleFocusMode, HOTKEY_OPTIONS);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <NoteHeader
          path={note.path}
          pinned={note.pinned}
          status={autosave.status}
          title={title}
        />
      </Titlebar>
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
          initialContent={sentineledBody ?? body}
          key={`${note.path}:${reloadKey}`}
          onChange={handleBodyChange}
          onReady={(handle) => {
            editorRef.current = handle;
          }}
          onWikilinkClick={openWikilink}
          resolveImageSrc={resolveImageSrc}
          stripSentinel={sentineledBody !== null}
          titles={getTitles}
          typewriterEnabled={typewriterEnabled}
        />
      )}
      <StatusBar
        allTags={tags}
        focusModeEnabled={focusModeEnabled}
        onFilterTag={(tag) => {
          navigate({ search: { tag }, to: "." });
        }}
        onToggleFocusMode={toggleFocusMode}
        onToggleSource={toggleSourceMode}
        onToggleTypewriter={toggleTypewriter}
        path={note.path}
        sourceEnabled={sourceMode}
        tags={note.tags}
        typewriterEnabled={typewriterEnabled}
        words={words}
      />
    </div>
  );
}
