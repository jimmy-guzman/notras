import { getRouteApi } from "@tanstack/react-router";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import { insertSentinel } from "@/components/editor/sentinel";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";
import { useAutosave } from "@/components/editor/use-autosave";
import { toast } from "@/components/ui/toast";
import { FileError } from "@/core/errors";
import { composeNote, parseNote } from "@/core/frontmatter";
import { noteFolder, noteTitle, resolveTitle } from "@/core/notes";
import { readExternalNote, writeExternalNote } from "@/data/external-note";
import { getNote } from "@/data/get-note";
import { saveNote } from "@/data/save-note";
import { usePref } from "@/lib/prefs";
import {
  clearRestoredCaret,
  closeTab,
  openNote,
  publishTabSnapshot,
  restoredCaret,
  subscribeRevision,
} from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { tabButtonId, tabId, tabPanelId } from "@/lib/tabs/tab";
import { errorMessage } from "@/lib/ui/failure";
import { cn } from "@/lib/ui/utils";
import { decodeAttachmentPath } from "@/lib/utils/attachments";
import { countWords } from "@/lib/utils/word-count";

const rootApi = getRouteApi("__root__");

/** One tab's file as of the last read. An external file reports no pin and no tags (`D54`). */
interface SessionFile {
  content: string;
  pinned: boolean;
  tags: string[];
  updatedAt: Date;
}

async function readTab(kind: Tab["kind"], path: string): Promise<SessionFile> {
  if (kind === "external") {
    const file = await readExternalNote(path);

    return {
      content: file.content,
      pinned: false,
      tags: [],
      updatedAt: file.updatedAt,
    };
  }

  const note = await getNote(path);

  return {
    content: note.content,
    pinned: note.pinned,
    tags: note.tags,
    updatedAt: note.updatedAt,
  };
}

interface SessionBufferProps {
  active: boolean;
  file: SessionFile;
  /** The file behind this buffer has gone; what is on screen is all there is. */
  missing: boolean;
  tab: Tab;
}

/**
 * One tab's buffer, autosave, and reconciliation against disk.
 *
 * Several are alive at once, so nothing here may register a window listener or
 * a hotkey: those belong to the workspace, and `D53` says why.
 */
function SessionBuffer({ active, file, missing, tab }: SessionBufferProps) {
  const { notes, notesDir } = rootApi.useLoaderData();
  const id = tabId(tab);

  const editorRef = useRef<EditorHandle | null>(null);
  const sourceRef = useRef<null | SourceEditorHandle>(null);

  // The rich editor owns the BODY; frontmatter rides along from the latest
  // read so pin/tag toggles are never clobbered by a body save.
  const [frontmatterBlock, setFrontmatterLines] = useState(
    () => parseNote(file.content).raw
  );
  const frontmatterRef = useRef(frontmatterBlock);

  useEffect(() => {
    frontmatterRef.current = frontmatterBlock;
  });

  // Frontmatter follows the file (adjust-during-render pattern): a pin or tag
  // toggle rewrites it, and the next body save must compose with that fresh
  // block, not the one captured at mount.
  const [syncedContent, setSyncedContent] = useState(file.content);

  if (syncedContent !== file.content) {
    setSyncedContent(file.content);

    const fresh = parseNote(file.content).raw;

    // Compare what the block serializes to, so a delimiter change counts.
    if (composeNote(fresh, "") !== composeNote(frontmatterBlock, "")) {
      setFrontmatterLines(fresh);
    }
  }

  const [body, setBody] = useState(() => parseNote(file.content).body);
  const bodyRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  });

  const [words, setWords] = useState(() => countWords(file.content));
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const sourceModeRef = useRef(sourceMode);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  });

  // Anchors carried across mode toggles so the caret keeps its spot.
  const [sourceCursor, setSourceCursor] = useState(0);
  // Body carrying a sentinel char at the caret (set when leaving source mode,
  // and at mount for a tab restored from the last session); the rich editor
  // strips it after mount and places the caret.
  const [sentineledBody, setSentineledBody] = useState<null | string>(() => {
    const caret = restoredCaret(id);

    return caret === undefined
      ? null
      : insertSentinel(parseNote(file.content).body, caret);
  });

  useEffect(() => {
    clearRestoredCaret(id);
  }, [id]);

  const focusModeEnabled = usePref("focus-mode");
  const typewriterEnabled = usePref("typewriter");

  // Tracks the mtime of our own writes so a re-read can tell an external edit
  // from a stale snapshot of something we just saved.
  const lastSavedAtRef = useRef(file.updatedAt);

  // Nothing flushes on the way back: a file can be recreated with different
  // content, and the reconcile below will not adopt it while the buffer is
  // dirty, so a write fired the moment a watcher event lands would clobber it.
  // The next keystroke or blur carries the buffer instead.
  const autosave = useAutosave(tab.path, {
    enabled: !missing,
    onSaved: (updatedAt) => {
      lastSavedAtRef.current = updatedAt;
    },
    write: tab.kind === "external" ? writeExternalNote : saveNote,
  });
  // Stable across renders, unlike `autosave` itself (a fresh object every
  // render, since `status` changes on every keystroke).
  const { onChange } = autosave;
  // Read by the effect below, which decides once and must not re-decide when a
  // write that was already in flight resolves.
  const statusRef = useRef(autosave.status);

  useEffect(() => {
    statusRef.current = autosave.status;
  });

  // `D32`'s chain, resolved off the live buffer rather than the last read, so
  // the tab label follows a heading as it is typed. An external file has no
  // frontmatter contract, so it is named by its file.
  const title =
    tab.kind === "external"
      ? (tab.path.split("/").at(-1) ?? tab.path)
      : resolveTitle(
          tab.path,
          body,
          parseNote(composeNote(frontmatterBlock, "")).frontmatter.title
        );

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
      src.includes("://")
        ? src
        : convertFileSrc(`${notesDir}/${decodeAttachmentPath(src)}`),
    [notesDir]
  );

  // Resolution is by title, then by filename stem. `D32` decoupled the two, so
  // a title is no longer unique and links written against a filename have to
  // keep working. Ties break by nearest folder, then by path.
  const openWikilink = useCallback(
    (linkTitle: string) => {
      const wanted = linkTitle.trim().toLowerCase();
      const currentFolder = noteFolder(tab.path);
      const target = notesRef.current
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
        })
        .at(0);

      if (target === undefined) {
        toast.add({ title: `no note named "${wanted}"`, type: "error" });

        return;
      }

      openNote(target.path);
    },
    [tab.path]
  );

  // External edits (AI agents, other editors) arrive as a re-read. Frontmatter
  // always follows the file; the body buffer reloads only when it is clean AND
  // the file on disk is newer than our own last write -- a stale read of a
  // just-saved note must never clobber the buffer.
  useEffect(() => {
    const parsed = parseNote(file.content);
    const isExternal =
      file.updatedAt.getTime() > lastSavedAtRef.current.getTime();

    if (autosave.status === "saved" && isExternal && parsed.body !== body) {
      lastSavedAtRef.current = file.updatedAt;
      setBody(parsed.body);
      setWords(countWords(file.content));
      setSentineledBody(null);
      setReloadKey((key) => key + 1);
    }
  }, [autosave.status, body, file.content, file.updatedAt]);

  const handleBodyChange = useCallback(
    (nextBody: string) => {
      const full = composeNote(frontmatterRef.current, nextBody);

      setBody(nextBody);
      setWords(countWords(full));
      onChange(full);
    },
    [onChange]
  );

  const handleSourceChange = useCallback(
    (raw: string) => {
      const parsed = parseNote(raw);

      setFrontmatterLines(parsed.raw);
      setBody(parsed.body);
      setWords(countWords(raw));
      onChange(raw);
    },
    [onChange]
  );

  const attachSourceEditor = useCallback((handle: SourceEditorHandle) => {
    sourceRef.current = handle;
  }, []);

  const attachEditor = useCallback((handle: EditorHandle) => {
    editorRef.current = handle;
  }, []);

  // Whichever surface is live owns the caret; the other one's handle is stale
  // (it was torn down by the mode toggle).
  // Body-relative, so source mode has to shed the frontmatter prefix the way
  // `toggleSource` does.
  const getCaret = useCallback(() => {
    if (!sourceModeRef.current) {
      return editorRef.current?.getCaretSourceOffset() ?? -1;
    }

    const offset = sourceRef.current?.getCursorOffset() ?? -1;

    if (offset === -1) {
      return -1;
    }

    const raw = composeNote(frontmatterRef.current, bodyRef.current);

    return Math.max(
      0,
      Math.min(
        offset - (raw.length - bodyRef.current.length),
        bodyRef.current.length
      )
    );
  }, []);

  const insertText = useCallback((text: string) => {
    const target = sourceModeRef.current
      ? sourceRef.current
      : editorRef.current;

    if (target === null) {
      toast.add({ title: "no editor to insert into", type: "error" });

      return;
    }

    target.insertText(text);
  }, []);

  // The caret rides through the markdown converters as a sentinel, so the
  // mapping between the two surfaces is exact (see sentinel.ts). The mode
  // comes off a ref, since the snapshot the chrome calls this through has to
  // stay stable.
  const toggleSource = useCallback(() => {
    const raw = composeNote(frontmatterRef.current, bodyRef.current);
    const prefixLength = raw.length - bodyRef.current.length;
    const wasSource = sourceModeRef.current;

    if (wasSource) {
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

    setSourceMode(!wasSource);
  }, []);

  // The chrome renders once above every session, so what it draws travels up
  // through the store rather than down through props.
  useEffect(() => {
    publishTabSnapshot(id, {
      getCaret,
      insertText,
      pinned: file.pinned,
      sourceMode,
      status: autosave.status,
      tags: file.tags,
      title,
      toggleSource,
      words,
    });
  });

  // A file that has gone takes its tab with it when the buffer holds nothing
  // worth keeping. Writing stops through `enabled` above, so the text can be
  // copied out without the save recreating the file.
  //
  // Decided once, against the status at the moment the file went. Re-deciding
  // on every status change closed the tab when a write already in flight
  // resolved and reported `saved`, throwing away the buffer this exists to
  // keep.
  useEffect(() => {
    if (missing && statusRef.current === "saved") {
      closeTab(id);
    }
  }, [missing, id]);

  // A tab mounted in the background never took focus, so it takes it on the
  // way in. ⌘P decides which surface owns the caret; the other one's handle
  // belongs to an editor that has already been destroyed.
  useEffect(() => {
    if (!active) {
      return;
    }

    if (sourceModeRef.current) {
      sourceRef.current?.focus();
    } else {
      editorRef.current?.focus();
    }
  }, [active]);

  return (
    <div
      aria-labelledby={tabButtonId(id)}
      className={cn(
        "absolute inset-0 flex flex-col",
        // `visibility` and nothing stronger: it keeps the box, and with it the
        // scroller's offset. `content-visibility: hidden` skips the subtree's
        // layout, which collapses the scroll height and clamps scrollTop to 0.
        !active && "pointer-events-none invisible"
      )}
      id={tabPanelId(id)}
      role="tabpanel"
    >
      {missing ? (
        <p className="shrink-0 border-b bg-card px-6 py-1.5 text-muted-foreground text-xs">
          this file is gone. nothing here is being saved, so copy what you need.
        </p>
      ) : null}
      {sourceMode ? (
        <SourceEditor
          focusOnMount={active}
          initialCursor={sourceCursor}
          initialValue={composeNote(frontmatterBlock, body)}
          key={`${reloadKey}:source`}
          onChange={handleSourceChange}
          onReady={attachSourceEditor}
        />
      ) : (
        <Editor
          focusModeEnabled={focusModeEnabled}
          focusOnMount={active}
          initialContent={sentineledBody ?? body}
          key={reloadKey}
          onChange={handleBodyChange}
          onReady={attachEditor}
          onWikilinkClick={tab.kind === "note" ? openWikilink : undefined}
          resolveImageSrc={tab.kind === "note" ? resolveImageSrc : undefined}
          stripSentinel={sentineledBody !== null}
          titles={getTitles}
          typewriterEnabled={typewriterEnabled}
        />
      )}
    </div>
  );
}

interface NoteSessionProps {
  active: boolean;
  tab: Tab;
}

/**
 * One open tab, from its file on disk to a live editor. Reads its own content
 * and re-reads when the watcher reports the folder changed (`D53`).
 */
export function NoteSession({ active, tab }: NoteSessionProps) {
  const { kind, path } = tab;
  const [file, setFile] = useState<null | SessionFile>(null);
  const [gone, setGone] = useState(false);
  // A watcher bump re-reads every tab, so a file that keeps refusing would
  // toast once per revision. Holding the message rather than a flag lets
  // React's bail-out collapse a repeat into one toast, which is the stacking
  // `D38` rejected.
  const [unreadable, setUnreadable] = useState<null | string>(null);

  useEffect(() => {
    let cancelled = false;
    // A burst of watcher events starts several reads, and nothing makes them
    // resolve in order. Only the newest may write state: an older rejection
    // landing after a newer success would put the gone banner back up over a
    // file that is there.
    let latest = 0;

    const read = () => {
      latest += 1;
      const attempt = latest;
      const stale = () => cancelled || attempt !== latest;

      readTab(kind, path)
        .then((next) => {
          if (!stale()) {
            setFile(next);
            setGone(false);
            setUnreadable(null);
          }
        })
        .catch((error: unknown) => {
          if (stale()) {
            return;
          }

          // Only a missing file is a deletion. A permission or IO failure
          // leaves the note where it was, so the tab keeps what it last read
          // (`D55`).
          if (error instanceof FileError && error.kind === "not-found") {
            setGone(true);

            return;
          }

          setUnreadable(errorMessage(error, "could not read this note"));
        });
    };

    read();

    const unsubscribe = subscribeRevision(read);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [kind, path]);

  useEffect(() => {
    if (unreadable !== null) {
      toast.add({ title: unreadable, type: "error" });
    }
  }, [unreadable]);

  // Nothing was ever read, so there is no buffer to protect and nothing to
  // show. A failed re-read of a tab that does have one is the buffer's own
  // decision, made in `SessionBuffer`.
  useEffect(() => {
    if (gone && file === null) {
      closeTab(tab.id);
    }
  }, [gone, file, tab.id]);

  if (file === null) {
    return null;
  }

  return <SessionBuffer active={active} file={file} missing={gone} tab={tab} />;
}
