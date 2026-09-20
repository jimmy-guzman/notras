import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { describe, expect, it, vi } from "vitest";

import {
  CodeBlockShiki,
  revealSyntax,
} from "@/components/editor/code-block-shiki";

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
    extensions: [Document, Paragraph, Text, CodeBlockShiki, UndoRedo, Markdown],
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
    .filter(
      (span) => span.getAttribute("style")?.includes(`var(--${role})`) === true
    )
    .map((span) => span.textContent)
    .join("");
}

describe("code block highlighting", () => {
  it("should tokenize only changed code blocks and no code for prose or selection edits", async ({
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
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("constconst");
    });
    // Observe what crosses to the worker without replacing its answers.
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    onTestFinished(() => {
      posted.mockRestore();
    });

    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });
    editor.commands.setTextSelection(1);
    expect(posted).not.toHaveBeenCalled();
    expect(coloredText(editor, "syntax-keyword")).toBe("constconst");

    editor.commands.insertContentAt({ from: 8, to: 13 }, "let");
    expect(posted).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "let a = 1;", language: "typescript" })
    );
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("letconst");
    });
  });

  it("should keep an edited block's colors until its new tokens arrive", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });

    editor.commands.insertContentAt(13, " // done");
    expect(coloredText(editor, "syntax-keyword")).toBe("const");
    expect(coloredText(editor, "syntax-comment")).toBe("");
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-comment")).toContain("done");
    });
    expect(coloredText(editor, "syntax-keyword")).toBe("const");
  });

  it("should land tokens only on blocks holding their text", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "let b = 2;");
    onTestFinished(() => {
      editor.destroy();
    });
    // The first block asks for "const a = 1;" and then takes its text back
    // while a second block holds that text, so the answer arrives after it.
    editor.commands.insertContentAt({ from: 1, to: 11 }, "const a = 1;");
    editor.commands.insertContentAt({ from: 1, to: 13 }, "let b = 2;");
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      attrs: { language: "ts" },
      content: [{ text: "const a = 1;", type: "text" }],
      type: "codeBlock",
    });

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("letconst");
    });
    const spans = [...editor.view.dom.querySelectorAll("pre")].map((pre) =>
      [...pre.querySelectorAll(".syntax-token")].map((span) => span.textContent)
    );
    expect(spans[0]).toContain("let");
    expect(spans[0]).not.toContain("let b");
    expect(spans[1]).toContain("const");
  });

  it("should clear obsolete colors when code becomes prose and restore them on undo", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });

    editor.commands.setTextSelection(1);
    editor.commands.setParagraph();
    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    expect(editor.commands.undo()).toBeTruthy();
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });
  });

  it("should decorate the latest text after loading without moving the caret or adding an undo step", async ({
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

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("constconst");
    });
    expect(editor.getJSON()).toStrictEqual(doc);
    expect(JSON.stringify(editor.state.selection.toJSON())).toBe(selection);
    expect(updates).toHaveLength(1);
    expect(editor.commands.undo()).toBeTruthy();
    expect(editor.state.doc.textContent).toBe("const a = 1;");
    expect(editor.commands.redo()).toBeTruthy();
    expect(editor.getJSON()).toStrictEqual(doc);
  });

  it("should follow a language change made while the first grammar loads", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("rust", "let value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    editor.commands.updateAttributes("codeBlock", { language: "json" });
    editor.commands.setTextSelection({ from: 1, to: 15 });
    editor.commands.insertContent('{"value": 2}');

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-member")).toContain("value");
    });
    expect(editor.state.doc.textContent).toBe('{"value": 2}');
    expect(editor.state.doc.firstChild?.attrs.language).toBe("json");
  });

  it.for(["", "not-a-language", "text"])(
    "should leave %s undecorated without rewriting its label",
    async (language, { onTestFinished }) => {
      const editor = createEditor(language, "const value = 1;");
      onTestFinished(() => {
        editor.destroy();
      });
      await Promise.resolve();

      expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
      expect(editor.getMarkdown()).toBe(
        `\`\`\`${language}\nconst value = 1;\n\`\`\``
      );
    }
  );

  it("should remove highlighting when a highlighted fence becomes plain", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });
    editor.commands.updateAttributes("codeBlock", { language: "" });

    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    expect(editor.getMarkdown()).toBe("```\nconst value = 1;\n```");
  });

  it("should load YAML and embedded code for source mode", async ({
    onTestFinished,
  }) => {
    const source =
      "---\npinned: true\n...\n# title\n\n```python\nreturn 42\n```";
    const editor = createEditor("markdown", source);
    onTestFinished(() => {
      editor.destroy();
    });

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-member")).toContain("pinned");
      expect(coloredText(editor, "syntax-keyword-control")).toContain("return");
    });
    expect(editor.state.doc.textContent).toBe(source);
  });

  it("should keep decorations aligned after inserting a block before the fence", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const value = 1;");
    onTestFinished(() => {
      editor.destroy();
    });
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });
    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });

    expect(editor.view.dom.querySelector("p")?.textContent).toBe("intro");
    expect(editor.view.dom.querySelector("p .syntax-token")).toBeNull();
    expect(coloredText(editor, "syntax-keyword")).toBe("const");
  });

  it("should dispatch nothing into an editor destroyed while its tokens are pending", async ({
    onTestFinished,
  }) => {
    const closed = createEditor("go", "package main");
    const open = createEditor("go", "package main");
    onTestFinished(() => {
      open.destroy();
    });
    closed.destroy();

    await vi.waitFor(() => {
      expect(open.view.dom.querySelector(".syntax-token")).not.toBeNull();
    });
    expect(open.state.doc.textContent).toBe("package main");
  });

  it("should keep colors on their lines after a line is inserted above them", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;\nconst b = 2;");
    onTestFinished(() => {
      editor.destroy();
    });
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("constconst");
    });

    editor.commands.insertContentAt(1, "// note\n");
    expect(coloredText(editor, "syntax-keyword")).toBe("constconst");
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-comment")).toContain("note");
    });
    expect(coloredText(editor, "syntax-keyword")).toBe("constconst");
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

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toContain("const");
    });
    const near = coloredText(editor, "syntax-keyword").length / "const".length;
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
      coloredText(editor, "syntax-keyword").length / "const".length
    ).toBeLessThan(lines);
  });

  it("should color a long block whole while revealed and window it again after", async ({
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
    fakeViewport(editor, onTestFinished);
    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toContain("const");
    });
    expect(coloredText(editor, "syntax-keyword")).not.toBe(
      "const".repeat(lines)
    );

    const windowAgain = revealSyntax(editor.view);
    expect(coloredText(editor, "syntax-keyword")).toBe("const".repeat(lines));

    windowAgain();
    expect(coloredText(editor, "syntax-keyword")).not.toBe(
      "const".repeat(lines)
    );
    expect(coloredText(editor, "syntax-keyword")).toContain("const");
  });

  it("should tokenize a block once when the node is extended again", async ({
    onTestFinished,
  }) => {
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    onTestFinished(() => {
      posted.mockRestore();
    });
    const editor = new Editor({
      content: {
        content: [
          {
            attrs: { language: "ts" },
            content: [{ text: "const a = 1;", type: "text" }],
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
        CodeBlockShiki.extend({ name: "codeBlock" }),
        UndoRedo,
        Markdown,
      ],
    });
    onTestFinished(() => {
      editor.destroy();
    });

    await vi.waitFor(() => {
      expect(coloredText(editor, "syntax-keyword")).toBe("const");
    });
    expect(posted).toHaveBeenCalledOnce();
  });
});
