import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "cn";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import type { FindHandle } from "@/components/editor/find";
import type { DocumentEdit } from "@/components/editor/note-document";
import { createNotePersistence } from "@/components/editor/note-persistence";
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
import { parseNote } from "@/core/frontmatter";
import { linkResolver } from "@/core/links";
import { writeExternalNote } from "@/data/external-note";
import { moveNote } from "@/data/move-note";
import type { SessionFile } from "@/data/queries";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { saveNote } from "@/data/save-note";
import { useFocusMode } from "@/lib/prefs";
import {
  clearRestoredCaret,
  closeTab,
  openNote,
  registerTabHandles,
  registerTabSnapshot,
  renameTab,
  restoredCaret,
} from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { tabButtonId, tabId, tabPanelId } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { noteFind, useNoteFind } from "@/lib/ui/find";
import { useGraphMode } from "@/lib/ui/graph";
import { decodeAttachmentPath } from "@/lib/utils/attachments";

function bodyPrefix(raw: string) {
  return raw.length - parseNote(raw).body.length;
}

interface SessionBufferProps {
  active: boolean;
  file: SessionFile;
  /** The file behind this buffer has gone; what is on screen is all there is. */
  missing: boolean;
  readFile: SessionFile | undefined;
  tab: Tab;
}

/**
 * One tab's buffer, autosave, and reconciliation against disk.
 *
 * Several are alive at once, so nothing here may register a window listener or
 * a hotkey: those belong to the workspace, and `D53` says why.
 */
function SessionBuffer({
  active,
  file,
  missing: readMissing,
  readFile,
  tab,
}: SessionBufferProps) {
  const { data: notes } = useSuspenseQuery(noteQueries.list());
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  const resolveLinks = useMemo(() => linkResolver(notes), [notes]);
  const id = tabId(tab);
  const graphMode = useGraphMode(id);
  const findState = useNoteFind();
  const focusOnMount = active && !findState.open;
  const [findHandle, setFindHandle] = useState<FindHandle | null>(null);

  useEffect(() => {
    if (active && !graphMode && findHandle?.alive()) {
      return noteFind.bind(findHandle);
    }
  }, [active, findHandle, graphMode]);

  const editorRef = useRef<EditorHandle | null>(null);
  const sourceRef = useRef<null | SourceEditorHandle>(null);
  const [persistence] = useState(() =>
    createNotePersistence(
      { ...file, kind: tab.kind, path: tab.path },
      {
        changePath: async (path, change) => await moveNote(path, change.folder),
        onCleanFileMissing: () => closeTab(id),
        onDocumentChanged: (content, selection) => {
          if (!persistence.store.state.sourceMode) {
            const currentBody = parseNote(content).body;
            const prefix = bodyPrefix(content);
            editorRef.current?.replaceContent(
              currentBody,
              selection === undefined
                ? undefined
                : {
                    anchor: Math.max(0, selection.anchor - prefix),
                    head: Math.max(0, selection.head - prefix),
                  }
            );
          }
        },
        onPathChanged: renameTab,
        write: async (path, content, name) =>
          tab.kind === "external"
            ? await writeExternalNote(path, content, name)
            : await saveNote(path, content, name),
      }
    )
  );
  const autosave = useAutosave(persistence);
  useLayoutEffect(() => {
    persistence.receiveFile(tab.path, readFile, readMissing);
  }, [persistence, readFile, readMissing, tab.path]);
  useLayoutEffect(
    () => registerTabSnapshot(id, persistence.snapshot),
    [id, persistence]
  );
  const { body } = parseNote(autosave.content);
  const { missing, sourceMode } = autosave;
  // Anchors carried across mode toggles so the caret keeps its spot.
  const [sourceCursor, setSourceCursor] = useState(0);
  // Body carrying a sentinel char at the caret (set when leaving source mode,
  // and at mount for a tab restored from the last session); the rich editor
  // strips it after mount and places the caret.
  const [sentineledBody, setSentineledBody] = useState<string | undefined>(
    () => {
      const caret = restoredCaret(id);

      return caret === undefined
        ? undefined
        : insertSentinel(parseNote(file.content).body, caret);
    }
  );

  useEffect(() => {
    clearRestoredCaret(id);
  }, [id]);

  const focusModeEnabled = useFocusMode();

  // Stable across renders, unlike `autosave` itself (a fresh object every
  // render, since `status` changes on every keystroke).
  const { onChange, onHistory } = autosave;

  // The editor freezes its props at mount, so its callbacks read live values
  // through this rather than through closures over render state. Declared
  // ahead of every effect that reads it, since effects run in order.
  const live = useRef({
    notes,
    resolveLinks,
  });

  useLayoutEffect(() => {
    live.current = {
      notes,
      resolveLinks,
    };
  });
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
      const target = live.current.resolveLinks.title(linkTitle, tab.path);

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

  // Hover asks the same question a click does, without the toast a miss gets.
  const resolveWikilink = useCallback(
    (linkTitle: string) =>
      live.current.resolveLinks.title(linkTitle, tab.path)?.path,
    [tab.path]
  );

  const openNoteLink = useCallback(
    (href: string) => {
      const target = live.current.resolveLinks.path(href, tab.path);

      if (target === undefined) {
        toast.add({ title: `no note at ${href}`, type: "error" });

        return;
      }

      openNote(target.path);
    },
    [tab.path]
  );

  const handleBodyChange = useCallback(
    (content: string, edit: DocumentEdit) => {
      const raw = persistence.store.state.content;
      const prefix = bodyPrefix(raw);
      onChange(
        { content, mode: "body" },
        {
          ...edit,
          selection:
            edit.selection === undefined
              ? undefined
              : {
                  anchor: edit.selection.anchor + prefix,
                  head: edit.selection.head + prefix,
                },
        }
      );
    },
    [onChange, persistence]
  );

  const selectBody = useCallback(
    (anchor: number, head: number) => {
      const raw = persistence.store.state.content;
      const prefix = bodyPrefix(raw);
      persistence.select(anchor + prefix, head + prefix);
    },
    [persistence]
  );

  const attachSourceEditor = useCallback((handle: SourceEditorHandle) => {
    sourceRef.current = handle;
    setFindHandle(handle.find);
  }, []);

  const attachEditor = useCallback((handle: EditorHandle) => {
    editorRef.current = handle;
    setFindHandle(handle.find);
  }, []);

  // Whichever surface is live owns the caret; the other one's handle is stale
  // (it was torn down by the mode toggle).
  // Body-relative, so source mode has to shed the frontmatter prefix the way
  // `toggleSource` does.
  const getCaret = useCallback(() => {
    if (!persistence.store.state.sourceMode) {
      return editorRef.current?.getCaretSourceOffset() ?? -1;
    }

    const offset = sourceRef.current?.getCursorOffset() ?? -1;

    if (offset === -1) {
      return -1;
    }

    const raw = persistence.store.state.content;
    const currentBody = parseNote(raw).body;

    return Math.max(0, Math.min(offset - bodyPrefix(raw), currentBody.length));
  }, [persistence]);

  const insertText = useCallback(
    (text: string) => {
      const target = persistence.store.state.sourceMode
        ? sourceRef.current
        : editorRef.current;

      if (target === null) {
        toast.add({ title: "no editor to insert into", type: "error" });

        return;
      }

      target.insertText(text);
    },
    [persistence]
  );

  // The caret rides through the markdown converters as a sentinel, so the
  // mapping between the two surfaces is exact (see sentinel.ts). The mode
  // is read from the session because tab handles outlive individual renders.
  const toggleSource = useCallback(() => {
    const raw = persistence.store.state.content;
    const currentBody = parseNote(raw).body;
    const prefixLength = bodyPrefix(raw);
    const wasSource = persistence.store.state.sourceMode;

    if (wasSource) {
      const offset = sourceRef.current?.getCursorOffset() ?? 0;
      const bodyOffset = Math.max(
        0,
        Math.min(offset - prefixLength, currentBody.length)
      );

      setSentineledBody(insertSentinel(currentBody, bodyOffset));
    } else {
      const offset = editorRef.current?.getCaretSourceOffset() ?? -1;

      setSourceCursor(offset === -1 ? raw.length : prefixLength + offset);
    }

    persistence.setSourceMode(!wasSource);
  }, [persistence]);

  const { changePath } = autosave;

  useEffect(() => {
    registerTabHandles(id, {
      changePath: tab.kind === "note" ? changePath : undefined,
      editMetadata: tab.kind === "note" ? persistence.editMetadata : undefined,
      getCaret,
      insertText,
      toggleSource,
    });
  }, [
    changePath,
    getCaret,
    id,
    insertText,
    persistence,
    tab.kind,
    toggleSource,
  ]);

  // A tab mounted in the background never took focus, so it takes it on the
  // way in. ⌘P decides which surface owns the caret; the other one's handle
  // belongs to an editor that has already been destroyed.
  useEffect(() => {
    if (!active || graphMode || noteFind.store.state.open) {
      return;
    }

    if (persistence.store.state.sourceMode) {
      sourceRef.current?.focus();
    } else {
      editorRef.current?.focus();
    }
  }, [active, graphMode, persistence]);

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
          editor={persistence.sourceEditor}
          focusOnMount={focusOnMount}
          initialCursor={sourceCursor}
          onReady={attachSourceEditor}
        />
      ) : (
        <Editor
          findOpen={findState.open}
          focusModeEnabled={focusModeEnabled}
          focusOnMount={focusOnMount}
          initialContent={sentineledBody ?? body}
          onChange={handleBodyChange}
          onHistory={onHistory}
          onNoteLinkClick={tab.kind === "note" ? openNoteLink : undefined}
          onReady={attachEditor}
          onSelect={selectBody}
          onWikilinkClick={tab.kind === "note" ? openWikilink : undefined}
          resolveImageSrc={tab.kind === "note" ? resolveImageSrc : undefined}
          resolveWikilink={tab.kind === "note" ? resolveWikilink : undefined}
          stripSentinel={sentineledBody !== undefined}
          titles={getTitles}
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

  return (
    <SessionBuffer
      active={active}
      file={file}
      missing={gone}
      readFile={data}
      tab={tab}
    />
  );
}
