import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { error as logError } from "@tauri-apps/plugin-log";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { flushSync } from "react-dom";

import type { EditorHandle } from "@/components/editor/editor";
import { Editor } from "@/components/editor/editor";
import type { FindHandle } from "@/components/editor/find";
import type {
  DocumentEdit,
  SelectionReader,
} from "@/components/editor/note-document";
import { createNotePersistence } from "@/components/editor/note-persistence";
import { insertSentinel } from "@/components/editor/sentinel";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";
import { useAutosave } from "@/components/editor/use-autosave";
import type { SaveStatus } from "@/components/editor/use-autosave";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { ConflictReview } from "@/components/workspace/conflict-review";
import { FileError } from "@/core/errors";
import { parseNote } from "@/core/frontmatter";
import {
  foldPath,
  hasScheme,
  isRelativeDestination,
  linkResolver,
} from "@/core/links";
import { noteTitle } from "@/core/notes";
import { clearConflictStash, stashConflict } from "@/data/conflict-stash";
import type { ConflictStash } from "@/data/conflict-stash";
import { writeExternalNote } from "@/data/external-note";
import { moveNote } from "@/data/move-note";
import { openExternalFile } from "@/data/open-external-file";
import { openLinkedFile } from "@/data/open-linked-file";
import type { SessionFile } from "@/data/queries";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { resolveExternalLink } from "@/data/resolve-external-link";
import { saveNote } from "@/data/save-note";
import { exportPdf } from "@/lib/export-pdf";
import { useFocusMode } from "@/lib/prefs";
import {
  clearRestoredCaret,
  closeTab,
  getTabState,
  openNote,
  openTab,
  registerTabHandles,
  registerTabSnapshot,
  renameTab,
  restoredCaret,
} from "@/lib/tabs/store";
import type { Tab } from "@/lib/tabs/tab";
import { tabButtonId, tabPanelId } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { noteFind, useNoteFind } from "@/lib/ui/find";
import { useGraphMode } from "@/lib/ui/graph";
import { decodeAttachmentPath } from "@/lib/utils/attachments";

function bodyPrefix(raw: string) {
  return raw.length - parseNote(raw).body.length;
}

interface SessionAlertsProps {
  missing: boolean;
  onReview: () => void;
  reason: string | undefined;
  reviewButton: RefObject<HTMLButtonElement | null>;
  status: SaveStatus;
}

/** The pane's standing alerts, in the note's column and above its scroller. */
function SessionAlerts({
  missing,
  onReview,
  reason,
  reviewButton,
  status,
}: SessionAlertsProps) {
  const failed = status === "failed";
  const conflict = status === "conflict";
  if (!(missing || failed || conflict)) {
    return null;
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-4 px-6 pt-6">
      {missing ? (
        <Alert variant="destructive">
          <AlertTitle>this file is gone</AlertTitle>
          <AlertDescription>
            Nothing here is being saved, so copy what you need
          </AlertDescription>
        </Alert>
      ) : null}
      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>this note could not be saved</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
      {conflict ? (
        <Alert variant="destructive">
          <AlertTitle>this note changed on disk</AlertTitle>
          <AlertDescription>
            Your unsaved edits overlap the change, so nothing saves until you
            review them
            {reason === undefined ? null : `. ${reason}`}
          </AlertDescription>
          <AlertAction>
            <Button
              onClick={onReview}
              ref={reviewButton}
              size="sm"
              variant="outline"
            >
              review
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
    </div>
  );
}

/** A fence longer than the highlighter's window is colored only near the viewport, so the print reveals it first. */
async function exportRevealed(
  editor: EditorHandle,
  name: string,
  title: string
) {
  const windowSyntax = editor.revealSyntax();
  try {
    return await exportPdf(editor.surface(), name, title);
  } finally {
    windowSyntax();
  }
}

interface SessionBufferProps {
  active: boolean;
  file: SessionFile;
  /** The file behind this buffer has gone; what is on screen is all there is. */
  missing: boolean;
  readFile: SessionFile | undefined;
  stash: ConflictStash | null;
  tab: Tab;
}

/**
 * A relative image resolves against the file that holds it, the way a link
 * does. A source with a scheme passes through for the webview to judge, and
 * an anchor or an absolute path renders as a broken image rather than a fetch
 * from the app's own bundle. A note's image loads through the asset protocol under
 * the notes dir, and one that climbs out renders as a broken image. An
 * external file's image goes to the `external-image` scheme with the document
 * and the source, and Rust resolves the pair on each request.
 */
function imageSrc(
  src: string,
  kind: "external" | "note",
  from: string,
  notesDir: string
) {
  if (!isRelativeDestination(src)) {
    return hasScheme(src) ? src : "";
  }

  const path = decodeAttachmentPath(src);

  if (kind === "external") {
    const query = new URLSearchParams({ doc: from, src: path });

    return `${convertFileSrc("", "external-image")}?${query}`;
  }

  const resolved = foldPath(path, from);

  return resolved === undefined
    ? ""
    : convertFileSrc(`${notesDir}/${resolved}`);
}

/**
 * One tab's buffer, autosave, and reconciliation against disk.
 *
 * Several are alive at once, so nothing here may register a window listener or
 * a hotkey: those belong to the workspace, and `D53` says why.
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- the split is tracked in #203
function SessionBuffer({
  active,
  file,
  missing: readMissing,
  readFile,
  stash,
  tab,
}: SessionBufferProps) {
  const { data: notes } = useQuery({
    ...noteQueries.list(),
    enabled: tab.kind === "note",
  });
  const queryClient = useQueryClient();
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);
  const resolveLinks = notes === undefined ? undefined : linkResolver(notes);
  const { id } = tab;
  const graphMode = useGraphMode(id);
  const findState = useNoteFind();
  const focusOnMount = active && !findState.open;
  const [findHandle, setFindHandle] = useState<FindHandle | null>(null);

  useEffect(
    () =>
      active && !graphMode && findHandle?.alive() === true
        ? noteFind.bind(findHandle)
        : undefined,
    [active, findHandle, graphMode]
  );

  const editorRef = useRef<EditorHandle | null>(null);
  const sourceRef = useRef<null | SourceEditorHandle>(null);
  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [persistence] = useState(() =>
    createNotePersistence(
      { ...file, path: tab.path, stash: stash ?? undefined },
      {
        changePath: async (path, change) => await moveNote(path, change.folder),
        clearStash: async (path) => {
          try {
            await clearConflictStash(tab.kind, path);
          } catch (error) {
            await logError(
              `could not remove the stored review: ${String(error)}`
            );
            throw error;
          }
          queryClient.setQueryData(
            noteQueries.conflict(tab.kind, path).queryKey,
            null
          );
        },
        onCleanFileMissing: () => {
          closeTab(id);
        },
        onPathChanged: renameTab,
        stash: async (path, review) => {
          await stashConflict(tab.kind, path, review);
          queryClient.setQueryData(
            noteQueries.conflict(tab.kind, path).queryKey,
            review
          );
        },
        write: async (path, content, name, expected) =>
          tab.kind === "external"
            ? await writeExternalNote(path, content, name, expected)
            : await saveNote(path, content, name, expected),
      }
    )
  );
  const autosave = useAutosave(persistence);
  useLayoutEffect(() => {
    const replaceDocument = (
      content: string,
      selection: { anchor: number; head: number } | undefined,
      sourceMode: boolean
    ) => {
      if (sourceMode) {
        return;
      }
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
    };
    return persistence.onDocumentChanged(replaceDocument);
  }, [persistence]);
  useLayoutEffect(() => {
    if (findHandle !== null) {
      persistence.receiveFile(tab.path, readFile, readMissing);
    }
  }, [findHandle, persistence, readFile, readMissing, tab.path]);
  useLayoutEffect(
    () => registerTabSnapshot(id, persistence.snapshot),
    [id, persistence]
  );
  const { body } = parseNote(autosave.content);
  const { changedAgain, missing, reason, sourceMode, status, theirs } =
    autosave;
  const [reviewing, setReviewing] = useState(false);
  const showReview = reviewing && status === "conflict";
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reviewingRef = useRef(false);
  useLayoutEffect(() => {
    reviewingRef.current = showReview;
  }, [showReview]);
  if (reviewing && status !== "conflict") {
    setReviewing(false);
  }
  const openReview = () => {
    setReviewing(true);
  };
  const backFromReview = () => {
    flushSync(() => {
      setReviewing(false);
    });
    reviewButton.current?.focus();
  };
  const resolveReview = (content: string) => {
    flushSync(() => {
      setReviewing(false);
    });
    void persistence.resolve(content);
    if (persistence.store.state.sourceMode) {
      sourceRef.current?.focus();
    } else {
      editorRef.current?.focus();
    }
  };
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
    path: tab.path,
    resolveLinks,
  });

  useLayoutEffect(() => {
    live.current = {
      notes,
      path: tab.path,
      resolveLinks,
    };
  });
  // Live values behind stable getters, so the mount-frozen editor callbacks
  // never go stale.
  const getTitles = () => live.current.notes?.map((meta) => meta.title) ?? [];

  const resolveImageSrc = (src: string) =>
    imageSrc(src, tab.kind, live.current.path, notesDir);
  const documentPath = () => live.current.path;

  const navigation = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => navigation.current?.abort(), []);
  useLayoutEffect(() => {
    if (!active) {
      navigation.current?.abort();
    }
  }, [active]);

  const followNote = async (kind: "title" | "path", value: string) => {
    navigation.current?.abort();
    const request = new AbortController();
    navigation.current = request;
    const origin = getTabState().activeId;
    const isCurrent = () =>
      !request.signal.aborted && getTabState().activeId === origin;
    try {
      const resolver =
        live.current.resolveLinks ??
        linkResolver(await queryClient.query(noteQueries.list()));
      if (!isCurrent()) {
        return;
      }
      const target = resolver[kind](value, live.current.path);
      if (target === undefined) {
        toast.add({
          title:
            kind === "title"
              ? `no note named "${value.trim().toLowerCase()}"`
              : `no note at ${value}`,
          type: "error",
        });
        return;
      }
      openNote(target.path);
    } catch (error) {
      if (isCurrent()) {
        toast.add({
          description: reasonOf(error),
          title: "could not open note",
          type: "error",
        });
      }
    }
  };
  const openWikilink = async (title: string) => {
    await followNote("title", title);
  };
  const openNoteLink = async (href: string) => {
    await followNote("path", href);
  };
  const resolveWikilink = (title: string) =>
    live.current.resolveLinks?.title(title, live.current.path)?.path;
  const openFileLink = async (href: string) => {
    try {
      await openLinkedFile(live.current.path, href);
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not open file",
        type: "error",
      });
    }
  };
  const openExternalFileLink = async (href: string) => {
    try {
      await openExternalFile(live.current.path, href);
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not open file",
        type: "error",
      });
    }
  };
  const openExternalNoteLink = async (href: string) => {
    navigation.current?.abort();
    const request = new AbortController();
    navigation.current = request;
    const origin = getTabState().activeId;
    const isCurrent = () =>
      !request.signal.aborted && getTabState().activeId === origin;
    try {
      const target = await resolveExternalLink(live.current.path, href);
      if (isCurrent()) {
        openTab(target.kind, target.path);
      }
    } catch (error) {
      if (isCurrent()) {
        toast.add({
          description: reasonOf(error),
          title: "could not open note",
          type: "error",
        });
      }
    }
  };

  // What the tab kind decides: a note's links resolve through the library and
  // its attachments land in it; an external file's links resolve against the
  // file, and it takes no attachments.
  const linkHandling =
    tab.kind === "note"
      ? {
          documentPath,
          onFileLinkClick: openFileLink,
          onNoteLinkClick: openNoteLink,
          onWikilinkClick: openWikilink,
          resolveWikilink,
        }
      : {
          documentPath: () => null,
          onFileLinkClick: openExternalFileLink,
          onNoteLinkClick: openExternalNoteLink,
        };

  const handleBodyChange = (content: string, edit: DocumentEdit) => {
    onChange({ content, mode: "body" }, edit);
  };

  // Read the prefix when asked: a metadata edit can change the frontmatter first.
  const deferBodySelection = (read: SelectionReader | undefined) => {
    persistence.deferSelection(
      read === undefined
        ? undefined
        : () => {
            const selection = read();
            const prefix = bodyPrefix(persistence.store.state.content);
            return selection === undefined
              ? undefined
              : {
                  anchor: selection.anchor + prefix,
                  head: selection.head + prefix,
                };
          }
    );
  };

  const attachSourceEditor = (handle: SourceEditorHandle) => {
    sourceRef.current = handle;
    setFindHandle(handle.find);
  };

  const attachEditor = (handle: EditorHandle) => {
    editorRef.current = handle;
    setFindHandle(handle.find);
  };

  const { changePath } = autosave;

  useEffect(() => {
    // Whichever surface is live owns the caret; the other one's handle is stale
    // (it was torn down by the mode toggle).
    // Body-relative, so source mode has to shed the frontmatter prefix the way
    // `toggleSource` does.
    const getCaret = () => {
      if (!persistence.store.state.sourceMode) {
        return editorRef.current?.getCaretSourceOffset() ?? -1;
      }

      const offset = sourceRef.current?.getCursorOffset() ?? -1;

      if (offset === -1) {
        return -1;
      }

      const raw = persistence.store.state.content;
      const currentBody = parseNote(raw).body;

      return Math.max(
        0,
        Math.min(offset - bodyPrefix(raw), currentBody.length)
      );
    };

    const insertText = (text: string) => {
      const target = persistence.store.state.sourceMode
        ? sourceRef.current
        : editorRef.current;

      if (target === null) {
        toast.add({ title: "no editor to insert into", type: "error" });

        return;
      }

      target.insertText(text);
    };

    // The caret rides through the markdown converters as a sentinel, so the
    // mapping between the two surfaces is exact (see sentinel.ts). The mode
    // is read from the session because tab handles outlive individual renders.
    const toggleSource = () => {
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
    };

    const exportRichPdf = async () => {
      const surface = persistence.store.state.sourceMode
        ? null
        : editorRef.current;

      if (surface === null) {
        throw new Error("Leave Markdown source first");
      }

      return await exportRevealed(
        surface,
        noteTitle(live.current.path),
        persistence.snapshot.state.title
      );
    };

    registerTabHandles(id, {
      changePath: tab.kind === "note" ? changePath : undefined,
      editMetadata: tab.kind === "note" ? persistence.editMetadata : undefined,
      exportPdf: exportRichPdf,
      getCaret,
      insertText,
      toggleSource,
    });
  }, [changePath, id, persistence, tab.kind]);

  // A tab mounted in the background never took focus, so it takes it on the
  // way in. ⌘P decides which surface owns the caret; the other one's handle
  // belongs to an editor that has already been destroyed.
  useEffect(() => {
    if (
      !active ||
      graphMode ||
      reviewingRef.current ||
      noteFind.store.state.open
    ) {
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
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          showReview && "pointer-events-none invisible"
        )}
      >
        <SessionAlerts
          missing={missing}
          onReview={openReview}
          reason={reason}
          reviewButton={reviewButton}
          status={status}
        />
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
            onReady={attachEditor}
            onSelect={deferBodySelection}
            resolveImageSrc={resolveImageSrc}
            stripSentinel={sentineledBody !== undefined}
            titles={getTitles}
            {...linkHandling}
          />
        )}
      </div>
      {status === "conflict" && theirs !== undefined ? (
        <ConflictReview
          base={autosave.base.content}
          changedAgain={changedAgain}
          key={theirs.revision}
          onBack={backFromReview}
          onResolve={resolveReview}
          open={showReview}
          ours={autosave.content}
          theirs={theirs.content}
        />
      ) : null}
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
  const stash = useQuery(noteQueries.conflict(kind, path));
  const { refetch: refetchStash } = stash;
  const retry = () => {
    void refetch();
    void refetchStash();
  };
  // A rename changes the key (`D56`) and a failed read clears the data, and
  // neither may take the buffer with it: the tab keeps what it last read
  // (`D55`). Query's own `keepPreviousData` covers only the pending case.
  const [lastRead, setLastRead] = useState(data);
  if (data !== undefined && data !== lastRead) {
    setLastRead(data);
  }
  // The stored review is keyed by path too, so a rename would otherwise leave
  // the gate below with nothing and unmount the buffer mid-session.
  const [lastStash, setLastStash] = useState(stash.data);
  if (stash.data !== undefined && stash.data !== lastStash) {
    setLastStash(stash.data);
  }

  const file = data ?? lastRead;
  const stored = stash.data === undefined ? lastStash : stash.data;

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
  // Opening without knowing whether a review is stored would start from the
  // disk file and lose the stashed text on the first save.
  if (stored === undefined) {
    return stash.isError ? (
      <UnreadableNote
        active={active}
        id={tab.id}
        reason={reasonOf(stash.error)}
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
      stash={stored}
      tab={tab}
    />
  );
}
