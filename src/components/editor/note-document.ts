import { Editor, Extension } from "@tiptap/core";
import {
  closeHistory,
  history,
  isHistoryTransaction,
  redo,
  undo,
} from "@tiptap/pm/history";
import { Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import { titleSource } from "@/core/notes";
import { styleNonce } from "@/lib/style-nonce";
import { renameDocument } from "./retitle-buffer";
import {
  createSourceExtensions,
  touchesSourceTitle,
} from "./source-extensions";

export interface DocumentEdit {
  selection?: { anchor: number; head: number };
  separate?: boolean;
  titleEdited: boolean;
}

type Naming = { kind: "content" } | { kind: "filename"; value: string };

function changedText(before: string, after: string) {
  let from = 0;
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  ) {
    from += 1;
  }
  let end = before.length;
  let nextEnd = after.length;
  while (
    end > from &&
    nextEnd > from &&
    before[end - 1] === after[nextEnd - 1]
  ) {
    end -= 1;
    nextEnd -= 1;
  }
  return { from: from + 1, text: after.slice(from, nextEnd), to: end + 1 };
}

/** The source editor's text state and history, retained across editor views. */
export function createNoteDocument(
  initial: string,
  filename: string,
  onSourceEdit?: () => void
) {
  let nextName = 0;
  let applying = false;
  const names = new Map<number, Naming>([
    [0, { kind: "filename", value: filename }],
  ]);
  const historyPlugin = history();
  const namingHistory = new Plugin({
    appendTransaction: (transactions, _previous, state) => {
      const edited = transactions.some(
        (tr) =>
          tr.docChanged &&
          !isHistoryTransaction(tr) &&
          tr.getMeta("addToHistory") !== false &&
          (tr.getMeta("titleEdited") === undefined
            ? touchesSourceTitle(tr)
            : tr.getMeta("titleEdited") === true)
      );
      if (!edited || titleSource(state.doc.textContent) === undefined) {
        return null;
      }
      nextName += 1;
      names.set(nextName, { kind: "content" });
      return state.tr.setDocAttribute("name", nextName);
    },
  });
  const editor = new Editor({
    content: {
      content: [
        {
          attrs: { language: "markdown" },
          content: initial === "" ? [] : [{ text: initial, type: "text" }],
          type: "codeBlock",
        },
      ],
      type: "doc",
    },
    element: null,
    extensions: [
      ...createSourceExtensions(historyPlugin),
      Extension.create({
        addProseMirrorPlugins: () => [namingHistory],
        name: "namingHistory",
      }),
    ],
    injectNonce: styleNonce,
    onTransaction: ({ transaction }) => {
      if (!applying && transaction.docChanged) {
        onSourceEdit?.();
      }
    },
    onUnmount: ({ editor: instance }) => {
      // A detached source view must not tokenize rich-mode edits.
      instance.view.updateState(
        instance.state.reconfigure({ plugins: [historyPlugin, namingHistory] })
      );
    },
  });
  // Tiptap normally installs plugins on first mount. Rich-mode edits need
  // source history before the source view has ever been displayed.
  editor.view.updateState(
    editor.state.reconfigure({ plugins: [historyPlugin, namingHistory] })
  );

  const content = () => editor.state.doc.textContent;
  const nameId = () => {
    const value: unknown = editor.state.doc.attrs.name;
    if (typeof value !== "number") {
      throw new Error("the document has no filename history");
    }
    return value;
  };
  const dispatch = (transaction: Transaction) => {
    applying = true;
    try {
      editor.view.dispatch(transaction);
    } finally {
      applying = false;
    }
  };
  const edit = (next: string, details: DocumentEdit) => {
    const patch = changedText(content(), next);
    const tr = details.separate
      ? closeHistory(editor.state.tr)
      : editor.state.tr;
    if (patch.from !== patch.to || patch.text !== "") {
      tr.insertText(patch.text, patch.from, patch.to);
    }
    tr.setMeta("titleEdited", details.titleEdited);
    // A touch with unchanged text still introduces a naming action.
    if (
      details.titleEdited &&
      !tr.docChanged &&
      titleSource(next) !== undefined
    ) {
      nextName += 1;
      names.set(nextName, { kind: "content" });
      tr.setDocAttribute("name", nextName).setMeta("titleEdited", false);
    }
    if (details.selection !== undefined) {
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          Math.max(0, Math.min(details.selection.anchor, next.length)) + 1,
          Math.max(0, Math.min(details.selection.head, next.length)) + 1
        )
      );
    }
    dispatch(tr);
    if (details.separate) {
      dispatch(closeHistory(editor.state.tr));
    }
  };
  return {
    acknowledgeName: (id: number, actual: string) => {
      names.set(id, { kind: "filename", value: actual });
    },
    canRedo: () => redo(editor.state),
    canUndo: () => undo(editor.state),
    content,
    destroy: () => editor.destroy(),
    edit,
    editor,
    nameId,
    naming: (): Naming => {
      const value = names.get(nameId());
      if (value === undefined) {
        throw new Error("the filename history is missing");
      }
      return value;
    },
    redo: () => redo(editor.state, dispatch),
    rename: (title: string) =>
      edit(renameDocument(content(), title), {
        separate: true,
        titleEdited: true,
      }),
    replace: (next: string) => {
      const patch = changedText(content(), next);
      dispatch(
        editor.state.tr
          .insertText(patch.text, patch.from, patch.to)
          .setMeta("addToHistory", false)
      );
      // Removing history's plugin state resets undo without replacing the view
      // or the syntax and find plugins attached to the same document.
      const { plugins } = editor.state;
      editor.view.updateState(
        editor.state.reconfigure({
          plugins: plugins.filter((plugin) => plugin !== historyPlugin),
        })
      );
      editor.view.updateState(editor.state.reconfigure({ plugins }));
    },
    select: (anchor: number, head: number) =>
      dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(
            editor.state.doc,
            Math.max(0, Math.min(anchor, content().length)) + 1,
            Math.max(0, Math.min(head, content().length)) + 1
          )
        )
      ),
    selection: () => ({
      anchor: editor.state.selection.anchor - 1,
      head: editor.state.selection.head - 1,
    }),
    undo: () => undo(editor.state, dispatch),
  };
}
