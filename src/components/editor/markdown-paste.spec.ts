/* oxlint-disable vitest/prefer-strict-equal -- ProseMirror attrs have a null prototype, so a literal never strictly equals getJSON() output */
import { setTimeout as sleep } from "node:timers/promises";

import { act, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditorExtensions,
  serializeMarkdown,
} from "@/components/editor/extensions";
import { Toaster } from "@/components/ui/toast";
import type { ClipboardSource } from "@/lib/ui/clipboard-source";

let editor: Editor | undefined;

function pasteText(target: Editor, text: string) {
  const clipboardData = new DataTransfer();

  clipboardData.setData("text/plain", text);
  target.view.dom.dispatchEvent(new ClipboardEvent("paste", { clipboardData }));
}

describe("markdown paste", () => {
  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it("should recognize HTML-only tasks whose marker crosses formatting", () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({}),
    });
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/html",
      "<ul><li><p>[<strong>x</strong>] <em>done</em></p></li><li>[ ]<ul><li>child</li></ul></li></ul>"
    );
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData })
    );
    expect(serializeMarkdown(editor)).toContain("- [x] *done*");
    expect(serializeMarkdown(editor)).toContain("\n  - child");
    expect(editor.state.doc.firstChild?.childCount).toBe(2);
  });

  it.each([
    ["<ul><li>[<code>x</code>] literal</li></ul>", "- [`x`] literal"],
    ["<ul><li>[ ] <code>task body</code></li></ul>", "- [ ] `task body`"],
    ["<ul><li><code>[x]</code> literal</li></ul>", "- `[x]` literal"],
    ["<ul><li>words [x] literal</li></ul>", "- words [x] literal"],
    ["<ol><li>[x] numbered</li></ol>", "1. [x] numbered"],
    [
      '<ul data-pm-slice="0 0 []"><li><p>[x] copied literal</p></li></ul>',
      String.raw`- \[x\] copied literal`,
    ],
    ["<pre><code>- [x] literal</code></pre>", "```\n- [x] literal\n```"],
  ])(
    "should preserve literal markers outside external task items: %s",
    (html, expected) => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "copied text");
      clipboardData.setData("text/html", html);
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      expect(serializeMarkdown(editor).trimEnd()).toBe(expected);
    }
  );

  it.each([
    [
      '<a href="https://a.test/page#one">one</a><a href="https://b.test/page#two">two</a><h2>One</h2><h2>Two</h2>',
      ["https://a.test/page#one", "https://b.test/page#two"],
    ],
    [
      '<a href="https://a.test/page?a=1#one">one</a><a href="https://a.test/page?a=2#two">two</a><h2>One</h2><h2>Two</h2>',
      ["https://a.test/page?a=1#one", "https://a.test/page?a=2#two"],
    ],
    [
      '<a href="https://a.test/page#one">one</a><a href="https://b.test/page#missing">missing</a><h2>One</h2>',
      ["#one", "https://b.test/page#missing"],
    ],
    [
      '<a href="https://a.test/page#d%C3%A9j%C3%A0-vu">go</a><h2>Déjà <em>Vu</em></h2>',
      ["#d%C3%A9j%C3%A0-vu"],
    ],
    [
      '<a href="https://a.test/page#%FF">go</a><h2>One</h2>',
      ["https://a.test/page#%FF"],
    ],
    ['<a href="https://a.test/page#one">go</a>', ["https://a.test/page#one"]],
    [
      '<a href="https://a.test/page#one">go</a><h2>One</h2><pre><code>const value = 1;</code></pre>',
      ["#one"],
    ],
    ['<a href="#one">go</a><h2>One</h2>', ["#one"]],
  ])(
    "should localize only matching fragments with one source URL: %s",
    (html, expected) => {
      editor = new Editor({
        content: "## One",
        contentType: "markdown",
        extensions: createEditorExtensions({}),
      });
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "copied text");
      clipboardData.setData("text/html", html);
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      expect(
        [...editor.view.dom.querySelectorAll("a")].map((anchor) =>
          anchor.getAttribute("href")
        )
      ).toStrictEqual(expected);
    }
  );

  it("should keep localized links in tables when native clipboard reading fails", async () => {
    editor = new Editor({
      content: "",
      extensions: createEditorExtensions({
        readClipboardSource: async () => {
          throw new Error("The clipboard is unavailable.");
        },
      }),
    });
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "copied text");
    clipboardData.setData(
      "text/html",
      '<table><thead><tr><th>Contents</th></tr></thead><tbody><tr><td><a href="https://source.test/page#one">One</a></td></tr></tbody></table><h2>One</h2><ul><li><input type="checkbox" checked> Done</li></ul>'
    );
    await act(async () => {
      editor?.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await sleep(0);
    });
    expect(serializeMarkdown(editor)).toContain("| [One](#one) |");
    expect(serializeMarkdown(editor).trimEnd()).toMatch(
      /## One\n\n- \[x\] Done$/u
    );
  });

  it.each([
    [
      '<ul><li><input type="checkbox" disabled> Map points</li><li><input type="checkbox" checked disabled> Done</li></ul>',
      "- [ ] Map points\n- [x] Done",
    ],
    [
      "<ul><li>[ ] Map points</li><li>[x] Done</li><li>[X] Also done</li></ul>",
      "- [ ] Map points\n- [x] Done\n- [x] Also done",
    ],
    [
      "<ul><li>bullet</li><li><p>[ ] <strong>task</strong></p><ul><li>[x] child</li></ul></li><li>last</li></ul>",
      "- bullet\n\n- [ ] **task**\n  - [x] child\n\n- last",
    ],
  ])(
    "should preserve pasted HTML tasks and their content: %s",
    (html, markdown) => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const before = editor.getJSON();
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "copied text");
      clipboardData.setData("text/html", html);
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      expect(serializeMarkdown(editor).trimEnd()).toBe(markdown);
      expect(editor.commands.undo()).toBeTruthy();
      expect(editor.getJSON()).toEqual(before);
    }
  );

  it.each([false, true])(
    "should recover local fragments from rendered HTML with native reading %s",
    async (native) => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: native ? async () => null : undefined,
        }),
      });
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "copied text");
      clipboardData.setData(
        "text/html",
        '<p><a href="https://source.test/page#first">one</a> <a href="https://source.test/page#first-1">two</a> <a href="https://source.test/page#missing">elsewhere</a></p><h2>First</h2><h2>First</h2>'
      );
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await sleep(0);
      expect(serializeMarkdown(editor).trimEnd()).toBe(
        "[one](#first) [two](#first-1) [elsewhere](https://source.test/page#missing)\n\n## First\n\n## First"
      );
    }
  );

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
            readClipboardSource: () => {
              throw new Error(reason);
            },
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
        await sleep(0);

        expect(editor.getJSON().content?.[0]).toEqual({
          content: [
            { text: "before ", type: "text" },
            { marks: [{ type: "bold" }], text: "bold", type: "text" },
            { text: " after", type: "text" },
          ],
          type: "paragraph",
        });
        expect(editor.commands.undo()).toBeTruthy();
        expect(editor.getJSON()).toEqual(before);
      }
    );

    it("should wait for an earlier paste before inserting a failed paste", async () => {
      const first = Promise.withResolvers<ClipboardSource | null>();

      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async (text) =>
            text === "first"
              ? await first.promise
              : await Promise.reject(
                  new Error("the clipboard metadata is invalid")
                ),
        }),
      });
      pasteText(editor, "first");
      pasteText(editor, "second");
      await sleep(0);

      expect(editor.state.doc.textContent).toBe("");
      first.resolve(null);
      await sleep(0);

      expect(editor.state.doc.textContent).toBe("firstsecond");
    });

    it("should leave an unmounted editor alone when the clipboard read fails", async () => {
      const clipboard = Promise.withResolvers<ClipboardSource | null>();

      editor = new Editor({
        content: "before",
        extensions: createEditorExtensions({
          readClipboardSource: async () => await clipboard.promise,
        }),
      });
      pasteText(editor, "after");
      editor.destroy();
      clipboard.reject(new Error("the clipboard metadata is invalid"));
      await sleep(0);

      expect(editor.state.doc.textContent).toBe("before");
    });

    it("should keep consecutive native pastes in their original order", async () => {
      const first = Promise.withResolvers<ClipboardSource | null>();
      const second = Promise.withResolvers<ClipboardSource | null>();

      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async (text) =>
            text === "first" ? await first.promise : await second.promise,
        }),
      });
      pasteText(editor, "first");
      pasteText(editor, "second");
      second.resolve({ kind: "code", language: "python" });
      first.resolve({ kind: "code", language: "python" });
      await sleep(0);

      expect(editor.state.doc.textContent).toBe("firstsecond");
    });

    it("should preserve VS Code and Cursor code when WebKit omits their metadata", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async () => ({
            kind: "code",
            language: "python",
          }),
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
      await sleep(0);

      expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
      expect(editor.state.doc.firstChild?.attrs.language).toBe("python");
      expect(editor.state.doc.firstChild?.textContent).toBe(
        "# comment\n\tprint(1)\n"
      );
      expect(editor.commands.undo()).toBeTruthy();
      expect(editor.state.doc.textContent).toBe("");
    });

    it("should paste one line from a code editor inline in place of the selection", () => {
      editor = new Editor({
        content: "before replace after",
        extensions: createEditorExtensions({}),
      });
      const before = editor.getJSON();
      const clipboardData = new DataTransfer();

      editor.commands.setTextSelection({ from: 8, to: 15 });
      clipboardData.setData("text/plain", "value");
      clipboardData.setData(
        "text/html",
        '<div style="white-space: pre;"><div><span>value</span></div></div>'
      );
      clipboardData.setData("vscode-editor-data", '{"mode":"ts"}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );

      expect(editor.getJSON().content).toEqual([
        {
          content: [
            { text: "before ", type: "text" },
            { marks: [{ type: "code" }], text: "value", type: "text" },
            { text: " after", type: "text" },
          ],
          type: "paragraph",
        },
      ]);
      expect(editor.commands.undo()).toBeTruthy();
      expect(editor.getJSON()).toEqual(before);
    });

    it("should paste one line from Zed inline", async () => {
      editor = new Editor({
        content: "before after",
        extensions: createEditorExtensions({
          readClipboardSource: async () => ({ kind: "code", language: null }),
        }),
      });
      editor.commands.setTextSelection(8);
      pasteText(editor, "print(1)");
      await sleep(0);

      expect(editor.getJSON().content).toEqual([
        {
          content: [
            { text: "before ", type: "text" },
            { marks: [{ type: "code" }], text: "print(1)", type: "text" },
            { text: "after", type: "text" },
          ],
          type: "paragraph",
        },
      ]);
    });

    it("should keep a whole-line copy ending in a newline as a code block", () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "print(1)\n");
      clipboardData.setData("vscode-editor-data", '{"mode":"python"}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );

      expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
      expect(editor.state.doc.firstChild?.attrs.language).toBe("python");
      expect(editor.state.doc.firstChild?.textContent).toBe("print(1)\n");
    });

    it("should parse a copy from a markdown file as markdown", () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "# heading\n\n**bold**");
      clipboardData.setData(
        "text/html",
        '<div style="white-space: pre;"><div><span># heading</span></div><br><div><span>**bold**</span></div></div>'
      );
      clipboardData.setData("vscode-editor-data", '{"mode":"markdown"}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );

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

    it("should read the event's editor metadata before the native clipboard", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: () => {
            throw new Error("the clipboard command is unavailable");
          },
        }),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "# comment\nprint(1)");
      clipboardData.setData("vscode-editor-data", '{"mode":"python"}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await sleep(0);

      expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
      expect(editor.state.doc.firstChild?.attrs.language).toBe("python");
    });

    it("should preserve the original paste when the editor metadata is malformed", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async () => null,
        }),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "print(1)");
      clipboardData.setData("vscode-editor-data", '{"mode":12}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await sleep(0);

      expect(editor.getJSON().content).toEqual([
        { content: [{ text: "print(1)", type: "text" }], type: "paragraph" },
      ]);
    });

    it("should preserve the original paste when the event metadata is malformed without the native reader", () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "print(1)");
      clipboardData.setData("vscode-editor-data", '{"mode":12}');
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );

      expect(editor.getJSON().content).toEqual([
        { content: [{ text: "print(1)", type: "text" }], type: "paragraph" },
      ]);
    });

    it("should parse a plain ordered list written with parentheses", () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      pasteText(editor, "1) one\n2) two");

      expect(editor.state.doc.firstChild?.type.name).toBe("orderedList");
      expect(editor.state.doc.firstChild?.childCount).toBe(2);
    });

    it("should paste Zed code as a block without a language", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async () => ({ kind: "code", language: null }),
        }),
      });
      pasteText(editor, "# comment\nprint(1)");
      await sleep(0);

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
          readClipboardSource: async () => null,
        }),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "bold");
      clipboardData.setData("text/html", "<p><strong>bold</strong></p>");
      editor.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );
      await sleep(0);

      expect(editor.getJSON().content?.[0]).toEqual({
        content: [{ marks: [{ type: "bold" }], text: "bold", type: "text" }],
        type: "paragraph",
      });
    });

    it.each([
      ["the app", async () => null],
      ["a browser", undefined],
    ])(
      "should keep rich HTML when its plain text looks like markdown in %s",
      async (_name, readClipboardSource) => {
        editor = new Editor({
          content: "",
          extensions: createEditorExtensions({ readClipboardSource }),
        });
        const clipboardData = new DataTransfer();

        clipboardData.setData("text/plain", "- one\n- two");
        clipboardData.setData(
          "text/html",
          '<p><a href="https://example.com">one</a> and <em>two</em></p>'
        );
        editor.view.dom.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData })
        );
        await sleep(0);

        expect(serializeMarkdown(editor)).toBe(
          "[one](https://example.com) and *two*"
        );
      }
    );

    it("should keep markdown marks literal in text copied from a rich-text app", async () => {
      editor = new Editor({
        content: "",
        enablePasteRules: ["link"],
        extensions: createEditorExtensions({
          readClipboardSource: async () => ({ kind: "richText" }),
        }),
      });
      pasteText(editor, "run **x** and `ls`");
      await sleep(0);

      expect(editor.getJSON().content).toEqual([
        {
          content: [{ text: "run **x** and `ls`", type: "text" }],
          type: "paragraph",
        },
      ]);
    });

    it("should paste text copied from a rich-text app as text", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async () => ({ kind: "richText" }),
        }),
      });
      pasteText(editor, "# install deps\nnpm install");
      await sleep(0);

      expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
        "paragraph",
        "paragraph",
      ]);
      expect(editor.state.doc.textContent).toBe("# install depsnpm install");
    });

    it("should still parse markdown when no native code metadata exists", async () => {
      editor = new Editor({
        content: "",
        extensions: createEditorExtensions({
          readClipboardSource: async () => null,
        }),
      });
      pasteText(editor, "~~~ts\nconst value = 1;\n~~~");
      await sleep(0);

      expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
      expect(editor.state.doc.firstChild?.attrs.language).toBe("ts");
    });

    it("should track the insertion point through edits while reading the clipboard", async () => {
      const clipboard = Promise.withResolvers<ClipboardSource | null>();

      editor = new Editor({
        content: "before after",
        extensions: createEditorExtensions({
          readClipboardSource: async () => await clipboard.promise,
        }),
      });
      editor.commands.setTextSelection(8);
      pasteText(editor, "print(1)\nprint(2)");
      editor.commands.insertContentAt(1, "new ");
      clipboard.resolve({ kind: "code", language: "python" });
      await sleep(0);

      expect(editor.state.doc.textContent).toBe(
        "new before print(1)\nprint(2)after"
      );
      expect(editor.getJSON().content?.[1]?.type).toBe("codeBlock");
    });

    it("should leave an unmounted editor alone when the clipboard read finishes", async () => {
      const clipboard = Promise.withResolvers<ClipboardSource | null>();

      editor = new Editor({
        content: "before",
        extensions: createEditorExtensions({
          readClipboardSource: async () => await clipboard.promise,
        }),
      });
      pasteText(editor, "print(1)");
      editor.destroy();
      clipboard.resolve({ kind: "code", language: "python" });
      await sleep(0);

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
            text: text.includes("# comment")
              ? "# comment\nprint(1)"
              : "print(1)",
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

      expect(editor.state.doc.textContent).toBe(
        "before const value = 1; after"
      );
      expect(editor.commands.undo()).toBeTruthy();
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

    it("should paste inline code and single-marker emphasis as rich text", () => {
      editor = new Editor({
        content: "",
        enablePasteRules: ["link"],
        extensions: createEditorExtensions({}),
      });
      pasteText(editor, "use `npm` and *it*");

      expect(editor.getJSON().content).toEqual([
        {
          content: [
            { text: "use ", type: "text" },
            { marks: [{ type: "code" }], text: "npm", type: "text" },
            { text: " and ", type: "text" },
            { marks: [{ type: "italic" }], text: "it", type: "text" },
          ],
          type: "paragraph",
        },
      ]);
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

  describe("plain paste", () => {
    it("should paste markdown-looking text as typed", async () => {
      editor = new Editor({
        content: "",
        enablePasteRules: ["link"],
        extensions: createEditorExtensions({
          readClipboardText: async () => "# heading\n**bold**",
        }),
      });

      editor.commands.keyboardShortcut("Mod-Alt-Shift-v");
      await sleep(0);

      expect(editor.getJSON().content).toEqual([
        { content: [{ text: "# heading", type: "text" }], type: "paragraph" },
        { content: [{ text: "**bold**", type: "text" }], type: "paragraph" },
      ]);
    });

    it("should paste where the key was pressed after the selection moves", async () => {
      const clipboard = Promise.withResolvers<string>();

      editor = new Editor({
        content: "before replace after",
        enablePasteRules: ["link"],
        extensions: createEditorExtensions({
          readClipboardText: async () => await clipboard.promise,
        }),
      });
      editor.commands.setTextSelection({ from: 8, to: 15 });
      editor.commands.keyboardShortcut("Mod-Alt-Shift-v");
      editor.commands.setTextSelection(1);
      editor.commands.insertContent("x");
      clipboard.resolve("*plain*");
      await sleep(0);

      expect(editor.state.doc.textContent).toBe("xbefore *plain* after");
    });

    it("should explain a clipboard with no text", async () => {
      render(createElement(Toaster));
      editor = new Editor({
        content: "note",
        extensions: createEditorExtensions({
          readClipboardText: async () => null,
        }),
      });

      editor.commands.keyboardShortcut("Mod-Alt-Shift-v");

      await expect(
        screen.findByText("The clipboard holds no text")
      ).resolves.toBeDefined();
      expect(editor.state.doc.textContent).toBe("note");
    });

    it("should still link a pasted URL", async () => {
      editor = new Editor({
        content: "",
        enablePasteRules: ["link"],
        extensions: createEditorExtensions({
          readClipboardText: async () => "see https://example.com",
        }),
      });

      editor.commands.keyboardShortcut("Mod-Alt-Shift-v");
      await sleep(0);

      expect(serializeMarkdown(editor)).toBe(
        "see [https://example.com](https://example.com)"
      );
    });
  });
});
