import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import type { CodeClipboard } from "@/lib/ui/code-clipboard";

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function pasteText(target: Editor, text: string) {
  const clipboardData = new DataTransfer();

  clipboardData.setData("text/plain", text);
  target.view.dom.dispatchEvent(new ClipboardEvent("paste", { clipboardData }));
}

describe("code paste", () => {
  it.each([
    "the clipboard metadata is invalid",
    "the clipboard command is unavailable",
  ])(
    "should preserve the original paste when reading fails: %s",
    async (reason) => {
      editor = new Editor({
        content: "before replace after",
        extensions: createEditorExtensions({
          readCodeClipboard: () => Promise.reject(new Error(reason)),
        }),
      });
      const before = editor.getJSON();
      const clipboardData = new DataTransfer();

      editor.commands.setTextSelection({ from: 8, to: 15 });
      clipboardData.setData("text/plain", "bold");
      clipboardData.setData("text/html", "<p><strong>bold</strong></p>");
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(editor.getJSON().content?.[0]).toEqual({
        content: [
          { text: "before ", type: "text" },
          { marks: [{ type: "bold" }], text: "bold", type: "text" },
          { text: " after", type: "text" },
        ],
        type: "paragraph",
      });
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getJSON()).toEqual(before);
    }
  );

  it("should wait for an earlier paste before inserting a failed paste", async () => {
    const first = Promise.withResolvers<CodeClipboard | null>();

    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: (text) =>
          text === "first"
            ? first.promise
            : Promise.reject(new Error("the clipboard metadata is invalid")),
      }),
    });
    pasteText(editor, "first");
    pasteText(editor, "second");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("");
    first.resolve(null);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("firstsecond");
  });

  it("should leave an unmounted editor alone when the clipboard read fails", async () => {
    const clipboard = Promise.withResolvers<CodeClipboard | null>();

    editor = new Editor({
      content: "before",
      extensions: createEditorExtensions({
        readCodeClipboard: () => clipboard.promise,
      }),
    });
    pasteText(editor, "after");
    editor.destroy();
    clipboard.reject(new Error("the clipboard metadata is invalid"));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("before");
  });

  it("should keep consecutive native pastes in their original order", async () => {
    const first = Promise.withResolvers<CodeClipboard | null>();
    const second = Promise.withResolvers<CodeClipboard | null>();

    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: (text) =>
          text === "first" ? first.promise : second.promise,
      }),
    });
    pasteText(editor, "first");
    pasteText(editor, "second");
    second.resolve({ language: "python" });
    first.resolve({ language: "python" });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("firstsecond");
  });

  it("should preserve VS Code and Cursor code when WebKit omits their metadata", async () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: () => Promise.resolve({ language: "python" }),
      }),
    });
    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", "# comment\n\tprint(1)\n");
    clipboardData.setData(
      "text/html",
      '<div style="white-space: pre;"><div><span># comment</span></div><div>  print(1)</div></div>'
    );
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData })
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
    expect(editor.state.doc.firstChild?.attrs.language).toBe("python");
    expect(editor.state.doc.firstChild?.textContent).toBe(
      "# comment\n\tprint(1)\n"
    );
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.textContent).toBe("");
  });

  it("should paste Zed code as a block without a language", async () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: () => Promise.resolve({ language: null }),
      }),
    });
    pasteText(editor, "# comment\nprint(1)");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
    expect(editor.state.doc.firstChild?.attrs.language).toBeNull();
    expect(editor.state.doc.firstChild?.textContent).toBe(
      "# comment\nprint(1)"
    );
  });

  it("should preserve ordinary HTML after the native clipboard declines it", async () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: () => Promise.resolve(null),
      }),
    });
    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", "bold");
    clipboardData.setData("text/html", "<p><strong>bold</strong></p>");
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData })
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.getJSON().content?.[0]).toEqual({
      content: [{ marks: [{ type: "bold" }], text: "bold", type: "text" }],
      type: "paragraph",
    });
  });

  it("should still parse markdown when no native code metadata exists", async () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readCodeClipboard: () => Promise.resolve(null),
      }),
    });
    pasteText(editor, "~~~ts\nconst value = 1;\n~~~");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
    expect(editor.state.doc.firstChild?.attrs.language).toBe("ts");
  });

  it("should track the insertion point through edits while reading the clipboard", async () => {
    const clipboard = Promise.withResolvers<CodeClipboard | null>();

    editor = new Editor({
      content: "before after",
      extensions: createEditorExtensions({
        readCodeClipboard: () => clipboard.promise,
      }),
    });
    editor.commands.setTextSelection(8);
    pasteText(editor, "print(1)");
    editor.commands.insertContentAt(1, "new ");
    clipboard.resolve({ language: "python" });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("new before print(1)after");
    expect(editor.getJSON().content?.[1]?.type).toBe("codeBlock");
  });

  it("should leave an unmounted editor alone when the clipboard read finishes", async () => {
    const clipboard = Promise.withResolvers<CodeClipboard | null>();

    editor = new Editor({
      content: "before",
      extensions: createEditorExtensions({
        readCodeClipboard: () => clipboard.promise,
      }),
    });
    pasteText(editor, "print(1)");
    editor.destroy();
    clipboard.resolve({ language: "python" });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(editor.state.doc.textContent).toBe("before");
  });

  it.each([
    ["backtick fences", "```python\n# comment\nprint(1)\n```", "", ""],
    ["tilde fences", "~~~python\n# comment\nprint(1)\n~~~", "", ""],
    [
      "tilde fences without markdown punctuation",
      "~~~python\nprint(1)\n~~~",
      "",
      "",
    ],
    ["VS Code metadata", "# comment\nprint(1)", "", '{"mode":"python"}'],
    [
      "HTML code",
      "# comment\nprint(1)",
      '<pre><code class="language-python"># comment\nprint(1)</code></pre>',
      "",
    ],
  ])("should preserve %s as a code block", (_name, text, html, metadata) => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({}),
    });
    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", text);
    clipboardData.setData("text/html", html);
    clipboardData.setData("vscode-editor-data", metadata);
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      })
    );

    expect(editor.getJSON().content?.[0]).toEqual({
      attrs: { language: "python" },
      content: [
        {
          text: text.includes("# comment") ? "# comment\nprint(1)" : "print(1)",
          type: "text",
        },
      ],
      type: "codeBlock",
    });
  });

  it("should keep surrounding HTML prose beside its code block", () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({}),
    });
    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", "intro\n# comment\nprint(1)\noutro");
    clipboardData.setData(
      "text/html",
      '<p>intro</p><pre><code class="language-python"># comment\nprint(1)</code></pre><p>outro</p>'
    );
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData })
    );

    expect(editor.getJSON().content).toEqual([
      { content: [{ text: "intro", type: "text" }], type: "paragraph" },
      {
        attrs: { language: "python" },
        content: [{ text: "# comment\nprint(1)", type: "text" }],
        type: "codeBlock",
      },
      { content: [{ text: "outro", type: "text" }], type: "paragraph" },
    ]);
  });

  it("should insert markdown literally inside an existing code block", () => {
    editor = new Editor({
      content: "```python\nbefore after\n```",
      contentType: "markdown",
      extensions: createEditorExtensions({}),
    });
    editor.commands.setTextSelection(8);
    pasteText(editor, "# comment\n**literal**\n");

    expect(editor.state.doc.firstChild?.textContent).toBe(
      "before # comment\n**literal**\nafter"
    );
    expect(editor.state.doc.firstChild?.attrs.language).toBe("python");
    expect(editor.state.selection.$from.parent.type.name).toBe("codeBlock");
  });

  it("should replace the selection with code in one undo step", () => {
    editor = new Editor({
      content: "before replace after",
      extensions: createEditorExtensions({}),
    });
    const before = editor.getJSON();

    editor.commands.setTextSelection({ from: 8, to: 15 });
    pasteText(editor, "~~~ts\nconst value = 1;\n~~~");

    expect(editor.state.doc.textContent).toBe("before const value = 1; after");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("should leave raw code without clipboard metadata as text", () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({}),
    });
    pasteText(editor, "const value = 1;");

    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(editor.state.doc.textContent).toBe("const value = 1;");
  });

  it("should still paste markdown prose as rich text", () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({}),
    });
    pasteText(editor, "# heading\n\n**bold**");

    expect(editor.getJSON().content).toEqual([
      {
        attrs: { level: 1 },
        content: [{ text: "heading", type: "text" }],
        type: "heading",
      },
      {
        content: [{ marks: [{ type: "bold" }], text: "bold", type: "text" }],
        type: "paragraph",
      },
    ]);
  });
});
