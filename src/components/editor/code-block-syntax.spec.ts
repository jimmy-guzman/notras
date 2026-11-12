import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { describe, expect, it, vi } from "vitest";

import {
  CodeBlockSyntax,
  measureViewport,
  revealSyntax,
} from "./code-block-syntax";

function createEditor(language: string, text: string) {
  return new Editor({
    content: {
      content: [
        {
          attrs: { language },
          content: [{ text, type: "text" }],
          type: "codeBlock",
        },
      ],
      type: "doc",
    },
    element: document.createElement("div"),
    extensions: [
      Document,
      Paragraph,
      Text,
      CodeBlockSyntax,
      UndoRedo,
      Markdown,
    ],
  });
}

/**
 * A viewport at the DOM boundary: the editor is 800px tall and a point's
 * height maps onto the characters `scrolled` to. `posAtCoords` reads these
 * three, and happy-dom lays nothing out itself.
 */
function fakeViewport(
  editor: Editor,
  onTestFinished: (fn: () => void) => void
) {
  let scrolled = 0;
  const characters = 2000;
  // A scroll reaches the editor only through a scroller it is in.
  const host = editor.view.dom.parentElement;

  if (host !== null) {
    document.body.append(host);
  }

  const caretAt = (_x: number, y: number) => {
    const { node, offset } = editor.view.domAtPos(
      1 + scrolled + Math.round((y / 800) * characters)
    );

    return { offset, offsetNode: node };
  };

  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => editor.view.dom.querySelector("code"),
  });
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: caretAt,
  });
  Object.defineProperty(editor.view.dom, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 800,
      height: 800,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
    }),
  });
  onTestFinished(() => {
    Reflect.deleteProperty(document, "elementFromPoint");
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    host?.remove();
  });

  return {
    scrollTo(character: number) {
      scrolled = character;
      document.dispatchEvent(new Event("scroll"));
    },
  };
}

function coloredText(editor: Editor, role: string) {
  return [...editor.view.dom.querySelectorAll(".syntax-token")]
    .flatMap((span) =>
      span.getAttribute("style")?.includes(`var(--${role})`) === true
        ? [span.textContent]
        : []
    )
    .join("");
}

describe("code block highlighting", () => {
  it("should keep colors through prose and selection edits and recolor an edited block", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      attrs: { language: "ts" },
      content: [{ text: "const b = 2;", type: "text" }],
      type: "codeBlock",
    });
    expect(coloredText(editor, "syntax-keyword")).toBe("const const ");

    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });
    editor.commands.setTextSelection(1);
    expect(coloredText(editor, "syntax-keyword")).toBe("const const ");

    editor.commands.insertContentAt({ from: 8, to: 13 }, "let");
    expect(coloredText(editor, "syntax-keyword")).toBe("let const ");
  });

  it("should color an edit as it lands", ({ onTestFinished }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });

    editor.commands.insertContentAt(13, " // done");

    expect(coloredText(editor, "syntax-comment")).toContain("done");
    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
  });

  it("should clear colors when code becomes prose and restore them on undo", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    expect(coloredText(editor, "syntax-keyword")).toBe("const ");

    editor.commands.setTextSelection(1);
    editor.commands.setParagraph();
    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    expect(editor.commands.undo()).toBeTruthy();
    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
  });

  it("should color the latest text without moving the caret or adding an undo step", ({
    onTestFinished,
  }) => {
    const editor = createEditor("typescript", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    const updates: string[] = [];
    editor.on("update", () => updates.push(editor.state.doc.textContent));
    editor.commands.setTextSelection(12);
    editor.commands.insertContent("\nconst b = 2;");
    const selection = JSON.stringify(editor.state.selection.toJSON());
    const doc = editor.getJSON();

    expect(coloredText(editor, "syntax-keyword")).toBe("const const ");
    expect(editor.getJSON()).toStrictEqual(doc);
    expect(JSON.stringify(editor.state.selection.toJSON())).toBe(selection);
    expect(updates).toHaveLength(1);
    expect(editor.commands.undo()).toBeTruthy();
    expect(editor.state.doc.textContent).toBe("const a = 1;");
    expect(editor.commands.redo()).toBeTruthy();
    expect(editor.getJSON()).toStrictEqual(doc);
  });

  it("should follow a language change", ({ onTestFinished }) => {
    const editor = createEditor("rust", "let value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    editor.commands.updateAttributes("codeBlock", { language: "json" });
    editor.commands.setTextSelection({ from: 1, to: 15 });
    editor.commands.insertContent('{"value": 2}');

    expect(coloredText(editor, "syntax-member")).toContain("value");
    expect(editor.state.doc.textContent).toBe('{"value": 2}');
    expect(editor.state.doc.firstChild?.attrs.language).toBe("json");
  });

  it.for(["", "not-a-language", "text"])(
    "should leave %s undecorated without rewriting its label",
    (language, { onTestFinished }) => {
      const editor = createEditor(language, "const value = 1;");
      onTestFinished(() => {
        editor.destroy();
      });

      expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
      expect(editor.getMarkdown()).toBe(
        `\`\`\`${language}\nconst value = 1;\n\`\`\``
      );
    }
  );

  it("should remove highlighting when a highlighted fence becomes plain", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
    // An attribute step keeps the block in place, unlike `updateAttributes`,
    // which replaces the node.
    editor.view.dispatch(editor.state.tr.setNodeAttribute(0, "language", ""));

    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    expect(editor.getMarkdown()).toBe("```\nconst value = 1;\n```");
  });

  it("should color YAML and embedded code for source mode", ({
    onTestFinished,
  }) => {
    const source =
      "---\npinned: true\n...\n# title\n\n```python\nreturn 42\n```";

    const editor = createEditor("markdown", source);
    onTestFinished(() => {
      editor.destroy();
    });

    expect(coloredText(editor, "syntax-member")).toContain("pinned");
    expect(coloredText(editor, "syntax-keyword-control")).toContain("return");
    expect(editor.state.doc.textContent).toBe(source);
  });

  it("should keep decorations aligned after inserting a block before the fence", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });

    expect(editor.view.dom.querySelector("p")?.textContent).toBe("intro");
    expect(editor.view.dom.querySelector("p .syntax-token")).toBeNull();
    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
  });

  it("should keep colors on their lines after a line is inserted above them", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;\nconst b = 2;");
    onTestFinished(() => {
      editor.destroy();
    });

    editor.commands.insertContentAt(1, "// note\n");

    expect(coloredText(editor, "syntax-comment")).toContain("note");
    expect(coloredText(editor, "syntax-keyword")).toBe("const const ");
    expect(editor.state.doc.textContent).toBe(
      "// note\nconst a = 1;\nconst b = 2;"
    );
  });

  it("should color a long block only near the viewport and follow a scroll", async ({
    onTestFinished,
  }) => {
    const lines = 3000;

    const editor = createEditor(
      "ts",
      Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`).join("\n")
    );

    onTestFinished(() => {
      editor.destroy();
    });
    const viewport = fakeViewport(editor, onTestFinished);
    const near = coloredText(editor, "syntax-keyword").length / "const ".length;

    expect(near).toBeGreaterThan(100);
    expect(near).toBeLessThan(lines);
    expect(coloredText(editor, "syntax-number")).toContain("0");
    expect(coloredText(editor, "syntax-number")).not.toContain(
      String(lines - 1)
    );

    viewport.scrollTo(editor.state.doc.content.size - 4000);
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-number")).toContain(String(lines - 1));
    });
    expect(
      coloredText(editor, "syntax-keyword").length / "const ".length
    ).toBeLessThan(lines);
  });

  it("should color the end of a block a little longer than the window", async ({
    onTestFinished,
  }) => {
    const editor = createEditor(
      "ts",
      [
        ...Array.from({ length: 850 }, (_, i) => `const v${i} = ${i};`),
        "const last = 987654321;",
      ].join("\n")
    );

    onTestFinished(() => {
      editor.destroy();
    });
    const viewport = fakeViewport(editor, onTestFinished);

    // The first measure narrows the window to the top of the block.
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-number")).not.toContain("987654321");
    });

    viewport.scrollTo(editor.state.doc.content.size - 2000);
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-number")).toContain("987654321");
    });
  });

  it("should color a long block whole while revealed and window it again after", ({
    onTestFinished,
  }) => {
    const lines = 1500;

    const editor = createEditor(
      "ts",
      Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`).join("\n")
    );

    onTestFinished(() => {
      editor.destroy();
    });
    expect(coloredText(editor, "syntax-keyword")).not.toBe(
      "const ".repeat(lines)
    );

    const windowAgain = revealSyntax(editor.view);
    expect(coloredText(editor, "syntax-keyword")).toBe("const ".repeat(lines));

    windowAgain();
    expect(coloredText(editor, "syntax-keyword")).not.toBe(
      "const ".repeat(lines)
    );
    expect(coloredText(editor, "syntax-keyword")).toContain("const");
  });

  it("should color short blocks only near the viewport and follow a scroll", async ({
    onTestFinished,
  }) => {
    const blocks = 1000;

    const editor = new Editor({
      content: {
        content: Array.from({ length: blocks }, (_, index) => ({
          attrs: { language: "ts" },
          content: [{ text: `const short${index} = 1;`, type: "text" }],
          type: "codeBlock",
        })),
        type: "doc",
      },
      element: document.createElement("div"),
      extensions: [
        Document,
        Paragraph,
        Text,
        CodeBlockSyntax,
        UndoRedo,
        Markdown,
      ],
    });

    onTestFinished(() => {
      editor.destroy();
    });
    const viewport = fakeViewport(editor, onTestFinished);

    const lastFence = () =>
      [...editor.view.dom.querySelectorAll("pre")]
        .at(-1)
        ?.querySelector(".syntax-token") ?? null;

    const near = coloredText(editor, "syntax-keyword").length / "const ".length;

    expect(near).toBeGreaterThan(100);
    expect(near).toBeLessThan(blocks);
    expect(lastFence()).toBeNull();

    viewport.scrollTo(editor.state.doc.content.size - 2000);
    await vi.waitFor(() => {
      expect(lastFence()).not.toBeNull();
    });
  });

  it("should color a block once when the node is extended again", ({
    onTestFinished,
  }) => {
    const editor = new Editor({
      content: {
        content: [
          {
            attrs: { language: "ts" },
            content: [{ text: "const once = 1;", type: "text" }],
            type: "codeBlock",
          },
        ],
        type: "doc",
      },
      element: document.createElement("div"),
      extensions: [
        Document,
        Paragraph,
        Text,
        CodeBlockSyntax.extend({ name: "codeBlock" }),
        UndoRedo,
        Markdown,
      ],
    });

    onTestFinished(() => {
      editor.destroy();
    });

    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
  });

  it("should color again after a reconfigure that drops and restores the plugin", ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const swapped = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    const { plugins } = editor.state;

    editor.view.updateState(editor.state.reconfigure({ plugins: [] }));
    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    editor.view.updateState(editor.state.reconfigure({ plugins }));

    expect(coloredText(editor, "syntax-keyword")).toBe("const ");
    expect(editor.state.doc.textContent).toBe("const swapped = 1;");
  });
});

describe(measureViewport, () => {
  it("should probe the text inside the visible part of an editor scrolled sideways", ({
    onTestFinished,
  }) => {
    const editor = createEditor("json", "x".repeat(20_000));
    const scroller = document.createElement("div");
    scroller.dataset.slot = "scroll-area-viewport";
    scroller.append(editor.view.dom);
    document.body.append(scroller);
    const probed: number[] = [];
    Object.defineProperty(scroller, "getBoundingClientRect", {
      value: () => ({ bottom: 800, left: 0, right: 600, top: 0 }),
    });
    Object.defineProperty(editor.view.dom, "getBoundingClientRect", {
      value: () => ({
        bottom: 800,
        height: 800,
        left: -9000,
        right: 4000,
        top: 0,
        width: 13_000,
      }),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number) => {
        probed.push(x);

        return editor.view.dom.querySelector("code");
      },
    });
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: (x: number) => {
        probed.push(x);
        const { node, offset } = editor.view.domAtPos(1);

        return { offset, offsetNode: node };
      },
    });
    onTestFinished(() => {
      Reflect.deleteProperty(document, "elementFromPoint");
      Reflect.deleteProperty(document, "caretPositionFromPoint");
      scroller.remove();
      editor.destroy();
    });

    measureViewport(editor.view);

    expect(probed).not.toHaveLength(0);
    expect(probed.every((x) => x > 0 && x < 600)).toBeTruthy();
  });
});
