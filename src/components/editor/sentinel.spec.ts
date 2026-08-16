import { Editor } from "@tiptap/core";

import { createEditorExtensions, serializeMarkdown } from "./extensions";
import { findSentinel, insertSentinel, SENTINEL } from "./sentinel";

function makeEditor(content: string) {
  return new Editor({
    content,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
}

/** Caret position right after the first occurrence of `needle` in the doc. */
function caretAfter(editor: Editor, needle: string) {
  let found = -1;

  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) {
      return false;
    }

    if (node.isText) {
      const index = node.text?.indexOf(needle) ?? -1;

      if (index !== -1) {
        found = pos + index + needle.length;

        return false;
      }
    }

    return true;
  });

  expect(found).not.toBe(-1);

  return found;
}

/** The markdown manager, failing the test when absent. */
function requireManager(editor: Editor) {
  const manager = editor.markdown;

  if (!manager) {
    throw new Error("markdown manager missing");
  }

  return manager;
}

/** findSentinel that fails the test instead of returning null. */
function requireSentinel(editor: Editor) {
  const pos = findSentinel(editor.state.doc);

  if (pos === null) {
    throw new Error("sentinel not found in parsed doc");
  }

  return pos;
}

/** Mirror of EditorHandle.getCaretSourceOffset for a headless instance. */
function caretSourceOffset(editor: Editor, pos: number) {
  const marked = editor.state.tr.insertText(SENTINEL, pos);
  const md: string = requireManager(editor).serialize(marked.doc.toJSON());

  return { md: md.replace(SENTINEL, ""), offset: md.indexOf(SENTINEL) };
}

describe("rich -> source caret mapping", () => {
  it.each([
    ["mid-bold", "some **bold** text", "bo"],
    ["mid-heading", "## a heading here", "head"],
    ["nested list item", "- one\n  - two deep\n- three", "two"],
    ["code block interior", "```ts\nconst abc = 1;\n```", "abc"],
    ["repeated words", "same same same", "same sa"],
  ])("should map exactly: %s", (_name, markdown, needle) => {
    const editor = makeEditor(markdown);
    const pos = caretAfter(editor, needle);
    const { md, offset } = caretSourceOffset(editor, pos);

    expect(offset).not.toBe(-1);
    // The characters before the source offset end with the visible text
    // that preceded the caret.
    expect(md.slice(0, offset).endsWith(needle.slice(-3))).toBe(true);

    editor.destroy();
  });
});

describe("source -> rich caret mapping", () => {
  it.each([
    ["mid-bold", "some **bold** text", "some **bo".length, "bo"],
    ["plain paragraph", "hello world", 5, "hello".slice(-3)],
    [
      "nested list",
      "- one\n  - two deep\n- three",
      "- one\n  - two".length,
      "two",
    ],
    ["repeated words", "same same same", "same same sa".length, " sa"],
  ])("should land exactly: %s", (_name, markdown, offset, before) => {
    const sentineled = insertSentinel(markdown, offset);
    const editor = makeEditor(sentineled);
    const pos = requireSentinel(editor);

    editor.view.dispatch(editor.state.tr.delete(pos, pos + 1));

    expect(
      editor.state.doc
        .textBetween(Math.max(0, pos - before.length), pos, "", " ")
        .endsWith(before.slice(-3)),
    ).toBe(true);

    // The stripped buffer serializes to the canonical clean form -- the
    // same comparison the runtime corruption guard makes (must NOT fire).
    const manager = requireManager(editor);
    const canonical: string = manager.serialize(manager.parse(markdown));

    expect(serializeMarkdown(editor).trimEnd()).toBe(
      canonical.replaceAll(/&nbsp;|&#160;/g, " ").trimEnd(),
    );

    editor.destroy();
  });

  it("should detect divergence when the sentinel splits a syntax token", () => {
    const markdown = "**bold**";
    // Caret between the two asterisks of the opening mark.
    const editor = makeEditor(insertSentinel(markdown, 1));
    const pos = requireSentinel(editor);

    editor.view.dispatch(editor.state.tr.delete(pos, pos + 1));

    const manager = requireManager(editor);
    const canonical: string = manager.serialize(manager.parse(markdown));

    // The stripped buffer no longer serializes to the canonical form --
    // exactly the condition the corruption guard reparses on.
    expect(serializeMarkdown(editor).trimEnd()).not.toBe(canonical.trimEnd());

    editor.destroy();
  });
});
