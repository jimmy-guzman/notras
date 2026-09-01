import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditorExtensions, serializeMarkdown } from "./extensions";

/**
 * The task-list CSS reaches a row as `ul[data-type="taskList"] > li` (`D39`),
 * which is only correct while TipTap renders a nested list inside the task
 * item's content div and leaves `data-type` off the node-view `li`. Nothing
 * else in the tree fails when a dependency bump changes either, and `D21` rules
 * out the end-to-end coverage that would have caught it.
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
    expect(nested[0]?.matches(TASK_LIST)).toBe(false);
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

    expect(row?.matches('li[data-checked="true"]')).toBe(true);
    expect(row?.matches('li[data-type="taskItem"]')).toBe(false);
  });
});

const typeInto = (text: string) => {
  const editor = new Editor({
    content: "",
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  for (const char of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp("handleTextInput", (input) =>
      input(editor.view, from, to, char, insert)
    );

    if (!handled) {
      editor.view.dispatch(insert());
    }
  }

  const markdown = serializeMarkdown(editor);

  editor.destroy();

  return markdown;
};

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

  it("should leave a tilde with no closer as typed", () => {
    expect(typeInto("takes ~5 minutes")).toBe("takes ~5 minutes");
  });

  it("should leave a closer that follows a space as typed", () => {
    expect(typeInto("~5 minutes ~")).toBe("~5 minutes ~");
  });
});
