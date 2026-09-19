import { Editor } from "@tiptap/core";
import { OrderedList, TaskList } from "@tiptap/extension-list";
import { Table } from "@tiptap/extension-table";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";

/** The app's stack with the three wrapped nodes swapped back for upstream's. */
const upstreamExtensions = () =>
  createEditorExtensions({}).map((extension) => {
    switch (extension.name) {
      case "orderedList": {
        return OrderedList;
      }
      case "taskList": {
        return TaskList;
      }
      case "table": {
        return Table.configure({ resizable: false });
      }
      default: {
        return extension;
      }
    }
  });

const parse = (markdown: string, extensions = createEditorExtensions({})) => {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions,
  });
  const json = editor.getJSON();

  editor.destroy();

  return json;
};

describe("bounded tokenizers", () => {
  it.each([
    "1. one\n2. two\n   1. nested\n   2. again\n3. three",
    "- [ ] open\n- [x] done\n  - [ ] nested open\n  - [x] nested done",
    "1. loose\n\n2. items\n\n3. apart\n\nprose after",
    "1. item\nlazy continuation line\n2. next",
    "1. item\n# heading after",
    "1. item\n\nprose after a blank line",
    "1. item\n\n   indented after a blank line\n2. next",
    "- [ ] task\n\n\n\nprose after two blank lines",
    "- [ ] task\n   \nprose after a whitespace line",
    "a) letter\nb) letter\n\n- [ ] task\n- [ ] task\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nprose",
    "| a | b |\n|---|---|\n| 1 | 2 |\nprose with no blank line",
    "para\n\n| a |\n|:--|\n| 1 |\n\n1. after a table",
    "text | with pipes\nno separator\n\n1) one\n\n\n2) far apart",
    "1. code fence inside\n\n   ```ts\n   const x = 1;\n   ```\n\n2. next",
    "1. item\n\n",
    "1. a\n# heading\n1. b\n## heading\n1. c",
    "- [ ] a\n- plain bullet\n- [ ] c",
    "1. a\n- [ ] task after an ordered item\n2. c",
    "1. a\n---\n1. b\n***\n1. c",
    "1. a\n```\ncode\n```\n1. b",
    "- [ ] a\n- [ ] b\n$$\nmath\n$$",
    "1. a\n  # not a heading, indented\n2. b",
    "- [ ] task\n\n\n",
    "| a |\n|---|\n| 1 |\n\n| b\n|--|\n\n|no separator|\nprose\n\n|--|\n|--|",
    "| a | b |\n|---|---|\n| 1 | 2 |\n# heading\n| c |\n|---|\n| 3 |\n> quote",
    "| a | b |\n|---|---|\n| 1 | 2 |\n- item\n\n| c | `d|e` |\n|---|---|\n| 3 | 4 |",
    "| a |\n|---|\n| 1 |\n\n\n\n| b |\n|---|",
  ])("should parse %j the way upstream does", (markdown) => {
    expect(parse(markdown)).toStrictEqual(
      parse(markdown, upstreamExtensions())
    );
  });
});
