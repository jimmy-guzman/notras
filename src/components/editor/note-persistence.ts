import { Debouncer } from "@tanstack/react-pacer";
import { createStore } from "@tanstack/react-store";
import {
  composeNote,
  type FrontmatterPatch,
  parseNote,
  updateFrontmatter,
} from "@/core/frontmatter";
import { resolveTitle } from "@/core/notes";
import { reasonOf } from "@/lib/ui/failure";
import { countWords } from "@/lib/utils/word-count";
import type { SaveName } from "@/server/adapters/bindings";
import { createNoteDocument, type DocumentEdit } from "./note-document";

export type SaveStatus = "dirty" | "failed" | "saved" | "saving";
export type PathChange =
  | { kind: "move"; folder: string }
  | { kind: "retitle"; title: string };

export interface EditorContent {
  content: string;
  mode: "body" | "document";
}

interface FileContent {
  content: string;
  revision: string;
  updatedAt: Date;
}

interface SaveReceipt {
  path: string;
  revision: string;
  updatedAt: Date;
}

interface PersistencePorts {
  changePath: (
    path: string,
    change: { kind: "move"; folder: string }
  ) => Promise<{ path: string; file: FileContent }>;
  onCleanFileMissing?: () => void;
  onDocumentChanged?: (
    content: string,
    selection?: { anchor: number; head: number }
  ) => void;
  onPathChanged: (from: string, to: string) => void;
  write: (
    path: string,
    content: string,
    name: SaveName | null
  ) => Promise<SaveReceipt>;
}

interface PersistenceState extends FileContent {
  missing: boolean;
  path: string;
  pendingPaths: number;
  reason: string | undefined;
  sourceMode: boolean;
  status: SaveStatus;
  writing: boolean;
}

export type NotePersistence = ReturnType<typeof createNotePersistence>;

/** A session's document and ordered writes; save receipts never edit its history. */
export function createNotePersistence(
  initial: FileContent & { path: string; kind: "note" | "external" },
  ports: PersistencePorts
) {
  const document = createNoteDocument(
    initial.content,
    initial.path.split("/").at(-1) ?? initial.path,
    () => changed()
  );
  const state = createStore<
    Omit<PersistenceState, "content" | "revision"> & { edits: number }
  >({
    edits: 0,
    missing: false,
    path: initial.path,
    pendingPaths: 0,
    reason: undefined,
    sourceMode: false,
    status: "saved",
    updatedAt: initial.updatedAt,
    writing: false,
  });
  const store = createStore(() => {
    const current = state.get();
    return {
      base,
      content: document.content(),
      missing: current.missing,
      path: current.path,
      pendingPaths: current.pendingPaths,
      reason: current.reason,
      sourceMode: current.sourceMode,
      status: current.status,
      updatedAt: current.updatedAt,
      writing: current.writing,
    };
  });
  const snapshot = createStore(() => {
    const current = store.get();
    const parsed = parseNote(current.content);
    return {
      pinned: parsed.frontmatter.pinned,
      reason: current.reason,
      sourceMode: current.sourceMode,
      status: current.status,
      tags: parsed.frontmatter.tags,
      title:
        initial.kind === "external"
          ? (current.path.split("/").at(-1) ?? current.path)
          : resolveTitle(current.path, parsed.body, parsed.frontmatter.title),
      words: countWords(current.content),
    };
  });
  let observation:
    | { path: string; file: FileContent | undefined; missing: boolean }
    | undefined;
  let base: FileContent = initial;
  let owners = 0;
  let edits = 0;
  let savedEdits = 0;
  let savedName = document.nameId();
  let tail: Promise<unknown> = Promise.resolve();

  const changed = () => {
    edits += 1;
    state.setState((previous) => ({
      ...previous,
      edits,
      reason: undefined,
      status: "dirty",
    }));
    debouncer.maybeExecute();
  };
  const followPath = (receipt: SaveReceipt) => {
    const from = state.state.path;
    state.setState((previous) => ({
      ...previous,
      path: receipt.path,
      updatedAt: receipt.updatedAt,
    }));
    if (from !== receipt.path) {
      ports.onPathChanged(from, receipt.path);
    }
  };
  const write = async () => {
    if (edits <= savedEdits || state.state.missing) {
      return;
    }
    const sentEdits = edits;
    const sentName = document.nameId();
    const content = document.content();
    const name = sentName === savedName ? null : document.naming();
    state.setState((previous) => ({
      ...previous,
      reason: undefined,
      status: "saving",
      writing: true,
    }));
    try {
      const receipt = await ports.write(state.state.path, content, name);
      document.acknowledgeName(
        sentName,
        receipt.path.split("/").at(-1) ?? receipt.path
      );
      savedName = sentName;
      savedEdits = sentEdits;
      base = {
        content,
        revision: receipt.revision,
        updatedAt: receipt.updatedAt,
      };
      followPath(receipt);
      state.setState((previous) => ({
        ...previous,
        status: edits > savedEdits ? "dirty" : "saved",
        writing: false,
      }));
    } catch (error) {
      state.setState((previous) => ({
        ...previous,
        reason: reasonOf(error),
        status: "failed",
        writing: false,
      }));
      throw error;
    } finally {
      reconcileFile();
    }
  };
  const save = () => {
    const run = async () => {
      try {
        await write();
        return true;
      } catch {
        return false;
      }
    };
    const next = tail.then(run, run);
    tail = next;
    return next;
  };
  const debouncer = new Debouncer(
    () => {
      save();
    },
    { wait: 800 }
  );
  const edit = (
    content: EditorContent,
    details: DocumentEdit = { headingEdited: false }
  ) => {
    const full =
      content.mode === "document"
        ? content.content
        : composeNote(parseNote(document.content()).raw, content.content);
    document.edit(full, details);
    changed();
  };
  const changePath = (change: PathChange) => {
    debouncer.cancel();
    if (change.kind === "retitle") {
      document.rename(change.title);
      changed();
      ports.onDocumentChanged?.(document.content());
      debouncer.cancel();
      const run = async () => {
        await write();
      };
      const next = tail.then(run, run);
      tail = next;
      return next;
    }
    state.setState((previous) => ({
      ...previous,
      pendingPaths: previous.pendingPaths + 1,
    }));
    const run = async () => {
      try {
        if (state.state.missing) {
          throw new Error("no such file");
        }
        await write();
        const receipt = await ports.changePath(state.state.path, change);
        base = receipt.file;
        followPath({
          path: receipt.path,
          revision: receipt.file.revision,
          updatedAt: receipt.file.updatedAt,
        });
      } finally {
        state.setState((previous) => ({
          ...previous,
          pendingPaths: previous.pendingPaths - 1,
        }));
        reconcileFile();
      }
    };
    const next = tail.then(run, run);
    tail = next;
    return next;
  };
  const flush = async () => {
    debouncer.cancel();
    do {
      // biome-ignore lint/performance/noAwaitInLoops: quit must drain edits that arrived during the preceding write
      if (!(await save())) {
        return false;
      }
    } while (!state.state.missing && edits > savedEdits);
    return true;
  };
  const applyHistory = (direction: "undo" | "redo", execute = true) => {
    if (!execute) {
      return direction === "undo" ? document.canUndo() : document.canRedo();
    }
    if (!document[direction]()) {
      return false;
    }
    changed();
    ports.onDocumentChanged?.(document.content(), document.selection());
    return true;
  };
  const reconcileContent = (file: FileContent) => {
    const current = state.state;
    const newer = file.updatedAt.getTime() > current.updatedAt.getTime();
    const reload =
      current.status === "saved" &&
      newer &&
      file.content !== document.content();
    if (reload) {
      document.replace(file.content);
      ports.onDocumentChanged?.(document.content());
      base = file;
    }

    if (!(current.missing || reload || newer)) {
      return;
    }
    state.setState((previous) => ({
      ...previous,
      missing: false,
      updatedAt: newer ? file.updatedAt : previous.updatedAt,
    }));
  };
  const reconcileFile = () => {
    if (
      observation === undefined ||
      state.state.pendingPaths !== 0 ||
      state.state.writing
    ) {
      return;
    }
    const { path, file, missing } = observation;
    observation = undefined;
    if (path !== state.state.path) {
      return;
    }
    if (missing && state.state.missing) {
      return;
    }
    if (missing) {
      const clean = state.state.status === "saved";
      state.setState((previous) => ({ ...previous, missing: true }));
      if (clean) {
        ports.onCleanFileMissing?.();
      }
      return;
    }
    if (file === undefined) {
      return;
    }
    reconcileContent(file);
  };
  const receiveFile = (
    path: string,
    file: FileContent | undefined,
    missing: boolean
  ) => {
    if (path !== state.state.path) {
      return;
    }
    observation = { file, missing, path };
    reconcileFile();
  };
  const editMetadata = async (patch: FrontmatterPatch) => {
    const next = updateFrontmatter(document.content(), patch);
    document.edit(next, { headingEdited: false, separate: true });
    changed();
    ports.onDocumentChanged?.(document.content());
    if (!(await flush())) {
      throw new Error(state.state.reason ?? "the note could not be saved");
    }
  };
  return {
    applyHistory,
    changePath,
    edit,
    editMetadata,
    flush,
    receiveFile,
    retain: () => {
      owners += 1;
      return async () => {
        owners -= 1;
        try {
          await flush();
        } finally {
          if (owners === 0) {
            debouncer.cancel();
            document.destroy();
          }
        }
      };
    },
    save,
    select: document.select,
    setSourceMode: (sourceMode: boolean) =>
      state.setState((current) => ({ ...current, sourceMode })),
    snapshot,
    sourceEditor: document.editor,
    store,
  };
}
