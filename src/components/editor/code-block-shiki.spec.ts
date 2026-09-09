import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { describe, expect, it, vi } from "vitest";

import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { loadSyntaxHighlighter } from "@/components/editor/syntax-highlighter";

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

function coloredText(editor: Editor, role: string) {
  return [...editor.view.dom.querySelectorAll(".syntax-token")]
    .filter((span) => span.getAttribute("style")?.includes(`var(--${role})`))
    .map((span) => span.textContent)
    .join("");
}

describe("code block highlighting", () => {
  it("should tokenize only changed code blocks and no code for prose or selection edits", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => editor.destroy());
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      attrs: { language: "ts" },
      content: [{ text: "const b = 2;", type: "text" }],
      type: "codeBlock",
    });
    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-keyword")).toBe("constconst")
    );
    const highlighter = await loadSyntaxHighlighter(["typescript"]);
    // Observe calls into the real grammar engine without replacing its output.
    const tokenize = vi.spyOn(highlighter, "codeToTokensBase");
    onTestFinished(() => tokenize.mockRestore());

    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });
    editor.commands.setTextSelection(1);
    expect(tokenize).not.toHaveBeenCalled();
    expect(coloredText(editor, "syntax-keyword")).toBe("constconst");

    editor.commands.insertContentAt({ from: 8, to: 13 }, "let");
    expect(tokenize.mock.calls.map(([text]) => text)).toEqual(["let a = 1;"]);
    expect(coloredText(editor, "syntax-keyword")).toBe("letconst");
  });

  it("should clear obsolete colors when code becomes prose and restore them on undo", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("ts", "const a = 1;");
    onTestFinished(() => editor.destroy());
    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-keyword")).toBe("const")
    );

    editor.commands.setTextSelection(1);
    editor.commands.setParagraph();
    expect(editor.view.dom.querySelector(".syntax-token")).toBeNull();
    expect(editor.commands.undo()).toBe(true);
    expect(coloredText(editor, "syntax-keyword")).toBe("const");
  });

  it("should decorate the latest text after loading without moving the caret or adding an undo step", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("typescript", "const a = 1;");
    onTestFinished(() => editor.destroy());
    const updates: string[] = [];
    editor.on("update", () => updates.push(editor.state.doc.textContent));
    editor.commands.setTextSelection(12);
    editor.commands.insertContent("\nconst b = 2;");
    const selection = editor.state.selection.toJSON();
    const doc = editor.getJSON();

    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-keyword")).toBe("constconst")
    );
    expect(editor.getJSON()).toEqual(doc);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(updates).toHaveLength(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.textContent).toBe("const a = 1;");
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(doc);
  });

  it("should follow a language change made while the first grammar loads", async ({
    onTestFinished,
  }) => {
    const editor = createEditor("rust", "let value = 1;");
    onTestFinished(() => editor.destroy());
    editor.commands.updateAttributes("codeBlock", { language: "json" });
    editor.commands.setTextSelection({ from: 1, to: 15 });
    editor.commands.insertContent('{"value": 2}');

    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-member")).toContain("value")
    );
    expect(editor.state.doc.textContent).toBe('{"value": 2}');
    expect(editor.state.doc.firstChild?.attrs.language).toBe("json");
  });

  it.for(["", "not-a-language", "text"])(
    "should leave %s undecorated without rewriting its label",
    async (language, { onTestFinished }) => {
      const editor = createEditor(language, "const value = 1;");
      onTestFinished(() => editor.destroy());
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
    onTestFinished(() => editor.destroy());
    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-keyword")).toBe("const")
    );
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
    onTestFinished(() => editor.destroy());

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
    onTestFinished(() => editor.destroy());
    await vi.waitFor(() =>
      expect(coloredText(editor, "syntax-keyword")).toBe("const")
    );
    editor.commands.insertContentAt(0, {
      content: [{ text: "intro", type: "text" }],
      type: "paragraph",
    });

    expect(editor.view.dom.querySelector("p")?.textContent).toBe("intro");
    expect(editor.view.dom.querySelector("p .syntax-token")).toBeNull();
    expect(coloredText(editor, "syntax-keyword")).toBe("const");
  });

  it("should allow two editors to load the same grammar when one closes", async ({
    onTestFinished,
  }) => {
    const closed = createEditor("go", "package main");
    const open = createEditor("go", "package main");
    onTestFinished(() => open.destroy());
    closed.destroy();

    await vi.waitFor(() =>
      expect(open.view.dom.querySelector(".syntax-token")).not.toBeNull()
    );
    expect(open.state.doc.textContent).toBe("package main");
  });
});
