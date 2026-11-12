import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditorExtensions, serializeMarkdown } from "./extensions";

/**
 * The task-list CSS reaches a row as `ul[data-type="taskList"] > li`,
 * which is only correct while TipTap renders a nested list inside the task
 * item's content div and leaves `data-type` off the node-view `li`.
 */
const render = (markdown: string) => {
  const element = document.createElement("div");

  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element,
    extensions: createEditorExtensions({}),
  });

  const rendered = document.createElement("div");

  rendered.innerHTML = element.innerHTML;
  editor.destroy();

  return rendered;
};

const TASK_LIST = 'ul[data-type="taskList"]';

describe("task item DOM", () => {
  it("should render a bullet list nested under a task as an ordinary list", () => {
    const nested = render("- [ ] parent\n  - child").querySelectorAll(
      `${TASK_LIST} > li > div > ul`
    );

    expect(nested).toHaveLength(1);
    expect(nested[0]?.matches(TASK_LIST)).toBeFalsy();
    expect(nested[0]?.querySelectorAll("li")).toHaveLength(1);
    expect(nested[0]?.querySelectorAll("input")).toHaveLength(0);
  });

  it("should render a nested task list inside the parent item's content", () => {
    const nested = render("- [ ] parent\n  - [x] child").querySelectorAll(
      `${TASK_LIST} > li > div > ${TASK_LIST}`
    );

    expect(nested).toHaveLength(1);
    expect(nested[0]?.querySelectorAll("input")).toHaveLength(1);
  });

  it("should identify a task row by its checked state, not by a node type", () => {
    const row = render("- [x] done").querySelector(`${TASK_LIST} > li`);

    expect(row?.matches('li[data-checked="true"]')).toBeTruthy();
    expect(row?.matches('li[data-type="taskItem"]')).toBeFalsy();
  });
});

const typeAt = (editor: Editor, text: string) => {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(char, from, to);

    const handled = editor.view.someProp("handleTextInput", (input) =>
      input(editor.view, from, to, char, insert)
    );

    if (handled !== true) {
      editor.view.dispatch(insert());
    }
  }
};

const typeInto = (text: string) => {
  const editor = new Editor({
    content: "",
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  typeAt(editor, text);

  const markdown = serializeMarkdown(editor);

  editor.destroy();

  return markdown;
};

const roundTrip = (markdown: string) => {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  const out = serializeMarkdown(editor);

  editor.destroy();

  return out;
};

describe("raw html", () => {
  it("should keep a block comment and an html block byte for byte", () => {
    expect(roundTrip("before\n\n<!-- a comment -->\n\nafter")).toBe(
      "before\n\n<!-- a comment -->\n\nafter"
    );
    expect(roundTrip('<div class="x">\n*not* markdown\n</div>\n\npara')).toBe(
      '<div class="x">\n*not* markdown\n</div>\n\npara'
    );
    expect(roundTrip("<!-- two trailing spaces -->  \n\nafter")).toBe(
      "<!-- two trailing spaces -->  \n\nafter"
    );
  });

  it("should keep inline tags and comments inside prose", () => {
    expect(roundTrip("press <kbd>Cmd</kbd> now <!-- why --> and a<br>b")).toBe(
      "press <kbd>Cmd</kbd> now <!-- why --> and a<br>b"
    );
    expect(roundTrip("<span>*x* `</span>` y</span> **z**")).toBe(
      "<span>*x* `</span>` y</span> **z**"
    );
    expect(roundTrip("<span>`` a ` </span> `` b</span> c")).toBe(
      "<span>`` a ` </span> `` b</span> c"
    );
    expect(roundTrip("<span>\\` x</span> y")).toBe("<span>\\` x</span> y");
    expect(roundTrip("a<span>&nbsp;</span>b\n\n<div>\nc&#160;d\n</div>")).toBe(
      "a<span>&nbsp;</span>b\n\n<div>\nc&#160;d\n</div>"
    );
  });

  it("should draw an image tag the editor can write back as an image", () => {
    const rendered = render(
      '<img src="x.png" alt="shot" width="300">\n\ntext <img src="y.png">'
    );

    expect(rendered.querySelector("pre[data-html]")).toBeNull();
    expect(rendered.querySelector("code[data-html]")).toBeNull();
    expect(
      [...rendered.querySelectorAll("img:not(.ProseMirror-separator)")].map(
        (image) => image.getAttribute("alt")
      )
    ).toStrictEqual(["shot", ""]);
  });

  it("should show raw html as code", () => {
    const rendered = render("<!-- note -->\n\ntext <kbd>k</kbd>");

    expect(rendered.querySelector("pre[data-html]")?.textContent).toBe(
      "<!-- note -->"
    );
    expect(rendered.querySelector("code[data-html]")?.textContent).toBe(
      "<kbd>k</kbd>"
    );
  });
});

describe("file markdown", () => {
  it("should serialize what the whole document would after edits to one block", () => {
    const editor = new Editor({
      content: "first\n\nsecond\n\nthird",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    expect(serializeMarkdown(editor)).toBe("first\n\nsecond\n\nthird");

    editor.commands.insertContentAt(
      editor.state.doc.child(0).nodeSize + 1,
      "re"
    );
    expect(serializeMarkdown(editor)).toBe("first\n\nresecond\n\nthird");

    // Emptying the first two paragraphs makes the second one read the
    // first, which is where a block's markdown depends on its neighbor.
    editor.commands.deleteRange({ from: 1, to: 6 });
    editor.commands.deleteRange({ from: 3, to: 11 });
    expect(editor.state.doc.childCount).toBe(3);
    expect(serializeMarkdown(editor)).toBe(editor.getMarkdown());
    expect(serializeMarkdown(editor)).toContain("&nbsp;");

    editor.destroy();
  });
});

describe("strike input rule", () => {
  it("should strike a span typed with one tilde", () => {
    expect(typeInto("~organization~")).toBe("~~organization~~");
  });

  it("should strike a span typed with two tildes", () => {
    expect(typeInto("~~organization~~")).toBe("~~organization~~");
  });

  it("should strike a span typed mid-sentence", () => {
    expect(typeInto("drop ~this~ one")).toBe("drop ~~this~~ one");
  });

  it("should strike a span typed with one tilde after a word", () => {
    expect(typeInto("word~x~")).toBe("word~~x~~");
  });

  it("should strike a span typed with one tilde before a word", () => {
    expect(typeInto("~x~word")).toBe("~~x~~word");
  });

  it("should leave a tilde with no closer as typed", () => {
    expect(typeInto("takes ~5 minutes")).toBe("takes ~5 minutes");
  });

  it("should leave a closer that follows a space as typed", () => {
    expect(typeInto("~5 minutes ~")).toBe("~5 minutes ~");
  });
});

const pressBackspace = (editor: Editor) =>
  editor.view.someProp("handleKeyDown", (handle) =>
    handle(editor.view, new KeyboardEvent("keydown", { key: "Backspace" }))
  );

describe("callouts", () => {
  it("should render a callout's type above its body", () => {
    const quote = render("> [!WARNING]\n> body").querySelector("blockquote");

    expect(quote?.dataset.callout).toBe("warning");
    expect(quote?.querySelector("[data-callout-title]")).toHaveTextContent(
      "warning"
    );
    expect(quote?.querySelector("p")).toHaveTextContent("body");
  });

  it("should render a plain quote without a title", () => {
    const quote = render("> body").querySelector("blockquote");

    expect(quote?.querySelector("[data-callout-title]")).toBeNull();
  });

  it("should read a copied callout back without its title row", () => {
    const editor = new Editor({
      content: "",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    const copied = render("> [!TIP]\n> body").querySelector("blockquote");

    editor.commands.setContent(copied?.outerHTML ?? "");

    const markdown = serializeMarkdown(editor);

    editor.destroy();

    expect(markdown).toBe("> [!TIP]\n> body");
  });

  it("should turn a quote into a callout when its marker is typed", () => {
    expect(typeInto("> [!tip] body")).toBe("> [!TIP]\n> body");
  });

  it("should change a callout's type when another marker is typed", () => {
    expect(typeInto("> [!tip] [!caution] body")).toBe("> [!CAUTION]\n> body");
  });

  it("should leave a marker typed outside a quote as text", () => {
    expect(typeInto("[!tip] body")).not.toMatch(/^>/u);
  });

  it("should turn a callout back into a quote, then lift it, on Backspace", () => {
    const editor = new Editor({
      content: "> [!NOTE]\n> body",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    editor.commands.setTextSelection(2);
    pressBackspace(editor);
    const quote = serializeMarkdown(editor);

    pressBackspace(editor);
    const lifted = editor.state.doc.firstChild?.type.name;

    editor.destroy();

    expect([quote, lifted]).toStrictEqual(["> body", "paragraph"]);
  });

  it("should leave a marker typed in a quote's second paragraph as text", () => {
    const editor = new Editor({
      content: "> one\n>\n> two",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    editor.commands.setTextSelection(7);
    typeAt(editor, "[!tip] ");
    const markdown = serializeMarkdown(editor);

    editor.destroy();

    expect(markdown).toBe("> one\n>\n> [!tip] two");
  });

  it("should keep a callout on Backspace at the start of its second paragraph", () => {
    const editor = new Editor({
      content: "> [!NOTE]\n> one\n>\n> two",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    editor.commands.setTextSelection(7);
    pressBackspace(editor);
    const markdown = serializeMarkdown(editor);

    editor.destroy();

    expect(markdown.trimEnd()).toBe("> [!NOTE]\n> one\n\ntwo");
  });

  it("should keep a callout whose first line is a typed, indented underline", () => {
    const editor = new Editor({
      content: "> [!NOTE]",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    editor.commands.setTextSelection(2);
    typeAt(editor, "   ===");
    const markdown = serializeMarkdown(editor);

    editor.destroy();

    expect(markdown).toBe("> [!NOTE]\n>\n>    ===");
  });

  it("should give back a marker just typed on Backspace", () => {
    const editor = new Editor({
      content: "> [!NOTE]\n> body",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: createEditorExtensions({}),
    });

    editor.commands.setTextSelection(2);
    typeAt(editor, "[!tip] ");
    pressBackspace(editor);
    const markdown = serializeMarkdown(editor);

    editor.destroy();

    expect(markdown).toBe("> [!NOTE]\n> [!tip] body");
  });
});
