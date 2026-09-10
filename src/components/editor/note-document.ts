import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { parseNote } from "@/core/frontmatter";
import { leadingHeading } from "@/core/notes";
import { renameDocument } from "./retitle-buffer";

export interface DocumentEdit {
  headingEdited: boolean;
  selection?: { anchor: number; head: number };
  separate?: boolean;
}

type Naming = { kind: "heading" } | { kind: "filename"; value: string };

const schema = new Schema({
  nodes: {
    doc: { attrs: { name: { default: 0 } }, content: "text*" },
    text: {},
  },
});

function createState(content: string, name: number) {
  return EditorState.create({
    doc: schema.node(
      "doc",
      { name },
      content === "" ? undefined : schema.text(content)
    ),
    plugins: [history()],
  });
}

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
  return { from, text: after.slice(from, nextEnd), to: end };
}

/** One Markdown document and history, independent of which editor displays it. */
export function createNoteDocument(initial: string, filename: string) {
  let state = createState(initial, 0);
  let nextName = 0;
  const names = new Map<number, Naming>([
    [0, { kind: "filename", value: filename }],
  ]);

  const nameId = () => {
    const value: unknown = state.doc.attrs.name;
    if (typeof value !== "number") {
      throw new Error("the document has no filename history");
    }
    return value;
  };
  const content = () => state.doc.textContent;
  const naming = (): Naming => {
    const value = names.get(nameId());
    if (value === undefined) {
      throw new Error("the filename history is missing");
    }
    return value;
  };
  const edit = (next: string, details: DocumentEdit) => {
    const patch = changedText(content(), next);
    const tr = details.separate ? closeHistory(state.tr) : state.tr;
    if (patch.from !== patch.to || patch.text !== "") {
      tr.insertText(patch.text, patch.from, patch.to);
    }
    if (
      details.headingEdited &&
      leadingHeading(parseNote(next).body) !== undefined
    ) {
      nextName += 1;
      names.set(nextName, { kind: "heading" });
      tr.setDocAttribute("name", nextName);
    }
    if (details.selection !== undefined) {
      const { anchor, head } = details.selection;
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          Math.max(0, Math.min(anchor, next.length)),
          Math.max(0, Math.min(head, next.length))
        )
      );
    }
    state = state.apply(tr);
    if (details.separate) {
      state = state.apply(closeHistory(state.tr));
    }
  };
  return {
    acknowledgeName: (id: number, actual: string) => {
      names.set(id, { kind: "filename", value: actual });
    },
    canRedo: () => redo(state),
    canUndo: () => undo(state),
    content,
    edit,
    nameId,
    naming,
    redo: () =>
      redo(state, (tr) => {
        state = state.apply(tr);
      }),
    rename: (title: string) =>
      edit(renameDocument(content(), title), {
        headingEdited: true,
        separate: true,
      }),
    replace: (next: string) => {
      const patch = changedText(content(), next);
      const updated = state.apply(
        state.tr
          .insertText(patch.text, patch.from, patch.to)
          .setMeta("addToHistory", false)
      );
      state = EditorState.create({
        doc: updated.doc,
        plugins: [history()],
        selection: updated.selection,
      });
    },
    select: (anchor: number, head: number) => {
      state = state.apply(
        state.tr.setSelection(
          TextSelection.create(
            state.doc,
            Math.max(0, Math.min(anchor, content().length)),
            Math.max(0, Math.min(head, content().length))
          )
        )
      );
    },
    selection: () => ({
      anchor: state.selection.anchor,
      head: state.selection.head,
    }),
    undo: () =>
      undo(state, (tr) => {
        state = state.apply(tr);
      }),
  };
}
