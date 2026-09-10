import { createStore } from "@tanstack/react-store";
import {
  composeNote,
  type FrontmatterPatch,
  parseNote,
  updateFrontmatter,
} from "@/core/frontmatter";
import { reasonOf } from "@/lib/ui/failure";
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
  updatedAt: Date;
}

interface SaveReceipt {
  path: string;
  updatedAt: Date;
}

interface PersistencePorts {
  changePath: (
    path: string,
    change: { kind: "move"; folder: string }
  ) => Promise<{ path: string; file: FileContent }>;
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
    initial.path.split("/").at(-1) ?? initial.path
  );
  const store = createStore<PersistenceState>({
    content: initial.content,
    missing: false,
    path: initial.path,
    pendingPaths: 0,
    reason: undefined,
    status: "saved",
    updatedAt: initial.updatedAt,
    writing: false,
  });
  let revision = 0;
  let savedRevision = 0;
  let savedName = document.nameId();
  let tail: Promise<unknown> = Promise.resolve();

  const changed = () => {
    revision += 1;
    store.setState((state) => ({
      ...state,
      content: document.content(),
      reason: undefined,
      status: "dirty",
    }));
  };
  const followPath = (receipt: SaveReceipt) => {
    const from = store.state.path;
    store.setState((state) => ({
      ...state,
      path: receipt.path,
      updatedAt: receipt.updatedAt,
    }));
    if (from !== receipt.path) {
      ports.onPathChanged(from, receipt.path);
    }
  };
  const write = async () => {
    if (revision <= savedRevision || store.state.missing) {
      return;
    }
    const sentRevision = revision;
    const sentName = document.nameId();
    const content = document.content();
    const name = sentName === savedName ? null : document.naming();
    store.setState((state) => ({
      ...state,
      reason: undefined,
      status: "saving",
      writing: true,
    }));
    try {
      const receipt = await ports.write(store.state.path, content, name);
      document.acknowledgeName(
        sentName,
        receipt.path.split("/").at(-1) ?? receipt.path
      );
      savedName = sentName;
      savedRevision = sentRevision;
      followPath(receipt);
      store.setState((state) => ({
        ...state,
        status: revision > savedRevision ? "dirty" : "saved",
        writing: false,
      }));
    } catch (error) {
      store.setState((state) => ({
        ...state,
        reason: reasonOf(error),
        status: "failed",
        writing: false,
      }));
      throw error;
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
    if (change.kind === "retitle") {
      document.rename(change.title);
      changed();
      ports.onDocumentChanged?.(document.content());
      const run = async () => {
        await write();
      };
      const next = tail.then(run, run);
      tail = next;
      return next;
    }
    store.setState((state) => ({
      ...state,
      pendingPaths: state.pendingPaths + 1,
    }));
    const run = async () => {
      try {
        if (store.state.missing) {
          throw new Error("no such file");
        }
        await write();
        const receipt = await ports.changePath(store.state.path, change);
        followPath({ path: receipt.path, updatedAt: receipt.file.updatedAt });
      } finally {
        store.setState((state) => ({
          ...state,
          pendingPaths: state.pendingPaths - 1,
        }));
      }
    };
    const next = tail.then(run, run);
    tail = next;
    return next;
  };
  const flush = async () => {
    do {
      // biome-ignore lint/performance/noAwaitInLoops: quit must drain edits that arrived during the preceding write
      if (!(await save())) {
        return false;
      }
    } while (!store.state.missing && revision > savedRevision);
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
  const receiveFile = (
    path: string,
    file: FileContent | undefined,
    missing: boolean
  ) => {
    if (
      path !== store.state.path ||
      store.state.pendingPaths !== 0 ||
      store.state.writing
    ) {
      return;
    }
    if (missing) {
      if (store.state.missing) {
        return;
      }
      store.setState((previous) => ({ ...previous, missing: true }));
      return;
    }
    if (file === undefined) {
      return;
    }
    const { state } = store;
    const newer = file.updatedAt.getTime() > state.updatedAt.getTime();
    const reload =
      state.status === "saved" && newer && file.content !== document.content();
    if (reload) {
      document.replace(file.content);
      ports.onDocumentChanged?.(document.content());
    }

    if (!state.missing && document.content() === state.content && !newer) {
      return;
    }
    store.setState((previous) => ({
      ...previous,
      content: document.content(),
      missing: false,
      updatedAt: newer ? file.updatedAt : previous.updatedAt,
    }));
  };
  const editMetadata = async (patch: FrontmatterPatch) => {
    const next = updateFrontmatter(document.content(), patch);
    document.edit(next, { headingEdited: false, separate: true });
    changed();
    ports.onDocumentChanged?.(document.content());
    if (!(await flush())) {
      throw new Error(store.state.reason ?? "the note could not be saved");
    }
  };
  return {
    applyHistory,
    changePath,
    edit,
    editMetadata,
    flush,
    receiveFile,
    save,
    select: document.select,
    store,
  };
}
