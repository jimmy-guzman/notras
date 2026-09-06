import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import { insertSentinel } from "@/components/editor/sentinel";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";
import { useAutosave } from "@/components/editor/use-autosave";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { FileError } from "@/core/errors";
import { composeNote, parseNote } from "@/core/frontmatter";
import { wikilinkResolver } from "@/core/links";
import { resolveTitle } from "@/core/notes";
import { writeExternalNote } from "@/data/external-note";
import type { SessionFile } from "@/data/queries";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { saveNote } from "@/data/save-note";
import { usePref } from "@/lib/prefs";
import {
  clearRestoredCaret,
  closeTab,
  openNote,
  publishTabSnapshot,
  registerTabHandles,
  restoredCaret,
} from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { tabButtonId, tabId, tabPanelId } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { useGraphMode } from "@/lib/ui/graph";
import { decodeAttachmentPath } from "@/lib/utils/attachments";
import { countWords } from "@/lib/utils/word-count";

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
  const { data: notes } = useSuspenseQuery(noteQueries.list());
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  const resolveWikilink = useMemo(() => wikilinkResolver(notes), [notes]);
  const id = tabId(tab);
  const graphMode = useGraphMode(id);

  const editorRef = useRef<EditorHandle | null>(null);
  const sourceRef = useRef<null | SourceEditorHandle>(null);

  // The rich editor owns the BODY; frontmatter rides along from the latest
  // read so pin/tag toggles are never clobbered by a body save.
  const [frontmatterBlock, setFrontmatterLines] = useState(
    () => parseNote(file.content).raw
  );
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
  const [words, setWords] = useState(() => countWords(file.content));
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
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

  // The editor freezes its props at mount, so its callbacks read live values
  // through this rather than through closures over render state. Declared
  // ahead of every effect that reads it, since effects run in order.
  const live = useRef({
    body,
    frontmatter: frontmatterBlock,
    notes,
    resolveWikilink,
    sourceMode,
    status: autosave.status,
  });

  useEffect(() => {
    live.current = {
      body,
      frontmatter: frontmatterBlock,
      notes,
      resolveWikilink,
      sourceMode,
      status: autosave.status,
    };
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
  const getTitles = useCallback(
    () => live.current.notes.map((meta) => meta.title),
    []
  );

  const resolveImageSrc = useCallback(
    (src: string) =>
      src.includes("://")
        ? src
        : convertFileSrc(`${notesDir}/${decodeAttachmentPath(src)}`),
    [notesDir]
  );

  const openWikilink = useCallback(
    (linkTitle: string) => {
      const target = live.current.resolveWikilink(linkTitle, tab.path);

      if (target === undefined) {
        toast.add({
          title: `no note named "${linkTitle.trim().toLowerCase()}"`,
          type: "error",
        });

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
      const full = composeNote(live.current.frontmatter, nextBody);

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
    if (!live.current.sourceMode) {
      return editorRef.current?.getCaretSourceOffset() ?? -1;
    }

    const offset = sourceRef.current?.getCursorOffset() ?? -1;

    if (offset === -1) {
      return -1;
    }

    const raw = composeNote(live.current.frontmatter, live.current.body);

    return Math.max(
      0,
      Math.min(
        offset - (raw.length - live.current.body.length),
        live.current.body.length
      )
    );
  }, []);

  const insertText = useCallback((text: string) => {
    const target = live.current.sourceMode
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
    const raw = composeNote(live.current.frontmatter, live.current.body);
    const prefixLength = raw.length - live.current.body.length;
    const wasSource = live.current.sourceMode;

    if (wasSource) {
      const offset = sourceRef.current?.getCursorOffset() ?? 0;
      const bodyOffset = Math.max(
        0,
        Math.min(offset - prefixLength, live.current.body.length)
      );

      setSentineledBody(insertSentinel(live.current.body, bodyOffset));
      setReloadKey((key) => key + 1);
    } else {
      const offset = editorRef.current?.getCaretSourceOffset() ?? -1;

      setSourceCursor(offset === -1 ? raw.length : prefixLength + offset);
    }

    setSourceMode(!wasSource);
  }, []);

  useEffect(() => {
    registerTabHandles(id, { getCaret, insertText, toggleSource });
  }, [getCaret, id, insertText, toggleSource]);

  // The chrome renders once above every session, so what it draws travels up
  // through the store rather than down through props.
  useEffect(() => {
    publishTabSnapshot(id, {
      pinned: file.pinned,
      reason: autosave.reason,
      sourceMode,
      status: autosave.status,
      tags: file.tags,
      title,
      words,
    });
  }, [
    autosave.reason,
    autosave.status,
    file.pinned,
    file.tags,
    id,
    sourceMode,
    title,
    words,
  ]);

  // A file that has gone takes its tab with it when the buffer holds nothing
  // worth keeping. Writing stops through `enabled` above, so the text can be
  // copied out without the save recreating the file.
  //
  // Decided once, against the status at the moment the file went. Re-deciding
  // on every status change closed the tab when a write already in flight
  // resolved and reported `saved`, throwing away the buffer this exists to
  // keep.
  useEffect(() => {
    if (missing && live.current.status === "saved") {
      closeTab(id);
    }
  }, [missing, id]);

  // A tab mounted in the background never took focus, so it takes it on the
  // way in. ⌘P decides which surface owns the caret; the other one's handle
  // belongs to an editor that has already been destroyed.
  useEffect(() => {
    if (!active || graphMode) {
      return;
    }

    if (live.current.sourceMode) {
      sourceRef.current?.focus();
    } else {
      editorRef.current?.focus();
    }
  }, [active, graphMode]);

  return (
    <div
      aria-labelledby={tabButtonId(id)}
      className={cn(
        "absolute inset-0 flex flex-col",
        // `visibility` and nothing stronger: it keeps the box, and with it the
        // scroller's offset. `content-visibility: hidden` skips the subtree's
        // layout, which collapses the scroll height and clamps scrollTop to 0.
        // The graph hides the editor the same way, so the caret and the scroll
        // are where they were when it leaves.
        (!active || graphMode) && "pointer-events-none invisible"
      )}
      id={tabPanelId(id)}
      role="tabpanel"
    >
      {missing ? (
        <Alert className="m-4 shrink-0" variant="destructive">
          <AlertTitle>this file is gone</AlertTitle>
          <AlertDescription>
            nothing here is being saved, so copy what you need
          </AlertDescription>
        </Alert>
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

interface UnreadableNoteProps {
  active: boolean;
  id: string;
  reason: string | undefined;
  retry: () => void;
}

/** The pane for a tab that never read: nothing to protect, so it says why. */
function UnreadableNote({ active, id, reason, retry }: UnreadableNoteProps) {
  return (
    <div
      aria-labelledby={tabButtonId(id)}
      className={cn(
        "absolute inset-0 flex flex-col",
        !active && "pointer-events-none invisible"
      )}
      id={tabPanelId(id)}
      role="tabpanel"
    >
      <Empty>
        <EmptyHeader>
          <EmptyTitle>could not read this note</EmptyTitle>
          {reason === undefined ? null : (
            <EmptyDescription>{reason}</EmptyDescription>
          )}
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            try again
          </Button>
        </EmptyContent>
      </Empty>
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
  const { data, error, refetch } = useQuery(noteQueries.file(kind, path));
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  // A rename changes the key (`D56`) and a failed read clears the data, and
  // neither may take the buffer with it: the tab keeps what it last read
  // (`D55`). Query's own `keepPreviousData` covers only the pending case.
  const lastRead = useRef<SessionFile | undefined>(undefined);

  useEffect(() => {
    if (data !== undefined) {
      lastRead.current = data;
    }
  }, [data]);

  const file = data ?? lastRead.current;

  // Only a missing file is a deletion. A permission or IO failure leaves the
  // note where it was, so the tab keeps what it last read (`D55`).
  const gone = error instanceof FileError && error.kind === "not-found";
  const unreadable = error !== null && !gone;
  // A string rather than the error instance, so a re-read that fails the same
  // way leaves the effect alone and stacks no second toast.
  const reason = unreadable ? reasonOf(error) : undefined;

  useEffect(() => {
    if (unreadable) {
      toast.add({
        description: reason,
        title: "could not read this note",
        type: "error",
      });
    }
  }, [unreadable, reason]);

  // Nothing was ever read, so there is no buffer to protect and nothing to
  // show. A failed re-read of a tab that does have one is the buffer's own
  // decision, made in `SessionBuffer`.
  useEffect(() => {
    if (gone && file === undefined) {
      closeTab(tab.id);
    }
  }, [gone, file, tab.id]);

  if (file === undefined) {
    return unreadable ? (
      <UnreadableNote
        active={active}
        id={tab.id}
        reason={reason}
        retry={retry}
      />
    ) : null;
  }

  return <SessionBuffer active={active} file={file} missing={gone} tab={tab} />;
}
