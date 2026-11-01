import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { createNoteDocument } from "@/components/editor/note-document";
import { SourceEditor } from "@/components/editor/source-editor";
import type { SourceEditorHandle } from "@/components/editor/source-editor";

describe("focus through the handle", () => {
  it("should keep the viewport where it was when focus reveals the caret", ({
    onTestFinished,
  }) => {
    const note = createNoteDocument("# title\n\nbody", "note.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];

    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: false,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );

    const [handle] = handles;

    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );

    if (handle === undefined || viewport === null) {
      throw new Error("source editor missing");
    }

    // Fakes WebKit at the DOM boundary: focus reads `preventScroll` the way a
    // supporting engine does and still scrolls the caret into view inside the
    // call. ProseMirror decides once per module, on its first focus, whether
    // the engine honors the option, so this runs before any other focus here.
    Object.defineProperty(note.editor.view.dom, "focus", {
      value(this: HTMLElement, options?: FocusOptions) {
        void options?.preventScroll;
        HTMLElement.prototype.focus.call(this, options);
        viewport.scrollTop = 0;
      },
    });
    viewport.scrollTop = 120;

    act(() => {
      handle.focus();
    });

    expect(document.activeElement).toBe(note.editor.view.dom);
    expect(viewport.scrollTop).toBe(120);
  });
});

describe("source editor focus", () => {
  it("should patch both title fields without replacing source selection or undo history", ({
    onTestFinished,
  }) => {
    const source = "---\ntitle: old\n---\n# old\nbody";
    const note = createNoteDocument(source, "old.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];

    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: source.length,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );

    const [handle] = handles;

    if (handle === undefined) {
      throw new Error("source editor missing");
    }

    const surface = container.querySelector(".ProseMirror");
    expect(surface).toBeInTheDocument();
    act(() => {
      handle.insertText(" plus typing");
    });
    act(() => {
      note.editor.view.dispatch(
        note.editor.state.tr
          .insertText(
            "---\ntitle: longer title\n---\n# longer title\n",
            1,
            source.indexOf("body") + 1
          )
          .setMeta("addToHistory", false)
      );
    });

    const expected =
      "---\ntitle: longer title\n---\n# longer title\nbody plus typing";

    expect(surface?.textContent).toBe(expected);
    expect(handle.getCursorOffset()).toBe(expected.length);
    expect(container.querySelector(".ProseMirror")).toBe(surface);
    act(() => {
      note.editor.commands.undo();
    });
    expect(surface?.textContent).toBe(
      "---\ntitle: longer title\n---\n# longer title\nbody"
    );
  });

  it("should leave focus alone when it is not the active surface", ({
    onTestFinished,
  }) => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    const note = createNoteDocument(
      "---\npinned: true\n---\n# a title",
      "a.md"
    );

    onTestFinished(() => {
      note.destroy();
      button.remove();
    });
    render(
      createElement(SourceEditor, { editor: note.editor, focusOnMount: false })
    );
    expect(button).toHaveFocus();
  });

  it("should take focus when mounted as the active surface", async ({
    onTestFinished,
  }) => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    const note = createNoteDocument(
      "---\npinned: true\n---\n# a title",
      "a.md"
    );

    onTestFinished(() => {
      note.destroy();
      button.remove();
    });

    const { container } = render(
      createElement(SourceEditor, { editor: note.editor, focusOnMount: true })
    );

    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toHaveFocus()
    );
  });
});

describe("source editor", () => {
  it("should break the line on shift+enter", ({ onTestFinished }) => {
    const note = createNoteDocument("one two", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: 3,
      })
    );

    // A native event: ProseMirror swallows Enter by its keyCode, which
    // user-event leaves at 0, so the key would land through the DOM instead.
    fireEvent.keyDown(note.editor.view.dom, {
      key: "Enter",
      keyCode: 13,
      shiftKey: true,
    });

    expect(note.content()).toBe("one\n two");
  });

  it.for([
    ["a numbered item", "1. one\n", "1. one\n   "],
    ["a bullet", "- one\n", "- one\n  "],
    ["a two-digit numbered item", "10. one\n", "10. one\n    "],
    ["a nested item", "1. one\n   - a\n   ", "1. one\n   - a\n     "],
    ["an item holding indented code", "-     code\n", "-     code\n  "],
    ["an empty item", "1.\n", "1.\n   "],
    ["a task", "- [ ] one\n", "- [ ] one\n  "],
    ["an item and a blank line", "1. one\n\n", "1. one\n\n   "],
    ["an item and an unindented line", "1. one\nmore\n", "1. one\nmore\n   "],
    [
      "an item after closed code",
      "```\nx\n```\n1. one\n",
      "```\nx\n```\n1. one\n   ",
    ],
    [
      "an item after inline code",
      "```js```\n\n1. one\n",
      "```js```\n\n1. one\n   ",
    ],
    ["an item with a tab after its marker", "1.\tone\n", "1.\tone\n    "],
  ] as const)(
    "should indent a line under %s to where its children start on tab",
    async ([, source, expected], { onTestFinished }) => {
      const user = userEvent.setup();
      const note = createNoteDocument(source, "a.md");
      onTestFinished(() => {
        note.destroy();
      });
      render(
        createElement(SourceEditor, {
          editor: note.editor,
          focusOnMount: true,
          initialCursor: source.length,
        })
      );

      await user.keyboard("{Tab}");

      expect(note.content()).toBe(expected);
    }
  );

  it("should indent two spaces under a paragraph on tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("text\n", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "text\n".length,
      })
    );

    await user.keyboard("{Tab}");

    expect(note.content()).toBe("text\n  ");
  });

  it("should indent two spaces after text under a list item on tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("10. one\nx", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "10. one\nx".length,
      })
    );

    await user.keyboard("{Tab}");

    expect(note.content()).toBe("10. one\nx  ");
  });

  it.for([
    ["fenced code", "```\n1. x\n"],
    ["fenced code a shorter run leaves open", "````\nx\n```\n1. x\n"],
    [
      "fenced code in a nested item",
      "1. one\n   - a\n     ```\n     1. x\n     ",
    ],
  ] as const)(
    "should indent two spaces under a numbered line in %s on tab",
    async ([, source], { onTestFinished }) => {
      const user = userEvent.setup();
      const note = createNoteDocument(source, "a.md");
      onTestFinished(() => {
        note.destroy();
      });
      render(
        createElement(SourceEditor, {
          editor: note.editor,
          focusOnMount: true,
          initialCursor: source.length,
        })
      );

      await user.keyboard("{Tab}");

      expect(note.content()).toBe(`${source}  `);
    }
  );

  it("should indent two spaces at an item's children after code closed inside it on tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const source = "1. one\n   ```\n   1. x\n   ```\n   ";
    const note = createNoteDocument(source, "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: source.length,
      })
    );

    await user.keyboard("{Tab}");

    expect(note.content()).toBe(`${source}  `);
  });

  it("should indent a line to where its item's children start with the caret before its spaces on tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("1. one\n  two", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "1. one\n".length,
      })
    );

    await user.keyboard("{Tab}");

    expect(note.content()).toBe("1. one\n   two");
  });

  it("should indent two spaces under a list in frontmatter on tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("---\ntags:\n  - a\n\n---\nbody", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "---\ntags:\n  - a\n".length,
      })
    );

    await user.keyboard("{Tab}");

    expect(note.content()).toBe("---\ntags:\n  - a\n  \n---\nbody");
  });

  it("should outdent two spaces in fenced code inside an item on shift+tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("1. one\n   ```\n   x", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "1. one\n   ```\n   x".length,
      })
    );

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(note.content()).toBe("1. one\n   ```\n x");
  });

  it.for([
    ["a fence in frontmatter", "---\ndesc: x\n  ```\n---\n1. one\n", "   "],
    [
      "a list in frontmatter closed with dots",
      "---\ntags:\n  - a\n...\n",
      "  ",
    ],
  ] as const)(
    "should read only the body below %s on tab",
    async ([, source, added], { onTestFinished }) => {
      const user = userEvent.setup();
      const note = createNoteDocument(source, "a.md");
      onTestFinished(() => {
        note.destroy();
      });
      render(
        createElement(SourceEditor, {
          editor: note.editor,
          focusOnMount: true,
          initialCursor: source.length,
        })
      );

      await user.keyboard("{Tab}");

      expect(note.content()).toBe(`${source}${added}`);
    }
  );

  it("should outdent two spaces outside a list on shift+tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("text\n    x", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "text\n    x".length,
      })
    );

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(note.content()).toBe("text\n  x");
  });

  it("should leave a line at the margin alone and keep focus on shift+tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("x", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: 1,
      })
    );

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(note.content()).toBe("x");
    expect(note.editor.view.hasFocus()).toBeTruthy();
  });

  it("should outdent a child of a numbered item back to its marker on shift+tab", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const note = createNoteDocument("1. one\n   1. two", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: "1. one\n   1. two".length,
      })
    );

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(note.content()).toBe("1. one\n1. two");
  });

  it("should retain source text and caret while highlighting and inserting text", async ({
    onTestFinished,
  }) => {
    const changes: string[] = [];
    const handles: SourceEditorHandle[] = [];

    const source =
      "---\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```";

    const note = createNoteDocument(source, "a.md", () => {
      changes.push(note.content());
    });

    onTestFinished(() => {
      note.destroy();
    });

    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: 4,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );

    await waitFor(() =>
      expect(container.querySelector(".syntax-token")).toBeInTheDocument()
    );
    const [handle] = handles;

    if (handle === undefined) {
      throw new Error("source editor missing");
    }

    expect(container.querySelector("pre")?.textContent).toBe(source);
    expect(handle.getCursorOffset()).toBe(4);
    expect(changes).toStrictEqual([]);
    act(() => {
      handle.insertText("# a comment\n");
    });
    expect(changes).toStrictEqual([
      "---\n# a comment\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```",
    ]);
    expect(handle.getCursorOffset()).toBe(16);
  });

  it("should release find navigation when its view detaches and search again after remount", ({
    onTestFinished,
  }) => {
    const note = createNoteDocument("needle needle", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];

    const { rerender } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => {
          handles.push(handle);
        },
      })
    );

    const [first] = handles;

    if (first === undefined) {
      throw new Error("source did not mount");
    }

    act(() => {
      first.find.setQuery("needle");
    });
    expect(first.find.snapshot().total).toBe(2);
    rerender(null);
    expect(first.find.alive()).toBeFalsy();
    expect(() => {
      first.find.navigate(1);
    }).not.toThrow();
    rerender(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => {
          handles.push(handle);
        },
      })
    );
    const second = handles.at(-1);
    expect(second?.find.alive()).toBeTruthy();
    act(() => second?.find.setQuery("needle"));
    expect(second?.find.snapshot().total).toBe(2);
  });
});

describe("source outline", () => {
  it.for([
    [
      "a title h1 holding inline markup",
      "# Hello *world*\n\n## A\n\n## B",
      ["A", "B"],
    ],
    ["an opening rule that is not frontmatter", "---  \n# A\n---\n# B", ["B"]],
    [
      "setext and quoted headings",
      "intro\n\nSetext\n------\n\n> ## Quoted\n\n## Plain",
      ["Setext", "Quoted", "Plain"],
    ],
    ["lone CR line breaks", "intro\r## B\r## C", ["B", "C"]],
    [
      "a stray CR",
      "## One\rstill one\n\n## Two\n\n## Three",
      ["One", "Two", "Three"],
    ],
  ] as const)(
    "should list what the note view lists for %s",
    ([, content, expected], { onTestFinished }) => {
      const note = createNoteDocument(content, "note.md");
      const host = document.createElement("div");
      document.body.append(host);
      onTestFinished(() => {
        note.destroy();
        host.remove();
      });

      render(
        createElement(SourceEditor, {
          editor: note.editor,
          focusOnMount: false,
          outlineHost: host,
        })
      );

      expect(
        within(screen.getByRole("navigation", { name: "outline" }))
          .getAllByRole("button")
          .map((button) => button.textContent)
      ).toStrictEqual(expected);
    }
  );

  it("should hand a jump on so a covering view can step aside", async ({
    onTestFinished,
  }) => {
    const note = createNoteDocument("## One\n\nbody\n\n## Two", "note.md");
    const host = document.createElement("div");
    document.body.append(host);
    onTestFinished(() => {
      note.destroy();
      host.remove();
    });
    const jumps: string[] = [];

    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: false,
        onOutlineJump: () => {
          jumps.push("jumped");
        },
        outlineHost: host,
      })
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Two" }));

    expect(jumps).toStrictEqual(["jumped"]);
    expect(note.editor.state.selection.from).toBe(
      note.editor.state.doc.textContent.indexOf("## Two") + 1
    );
  });

  it("should jump to a heading's own line past a stray CR", async ({
    onTestFinished,
  }) => {
    const content = "## One\rstill one\n\n## Two\n\n## Three";
    const note = createNoteDocument(content, "note.md");
    const host = document.createElement("div");
    document.body.append(host);
    onTestFinished(() => {
      note.destroy();
      host.remove();
    });

    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: false,
        outlineHost: host,
      })
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Two" }));

    expect(note.editor.state.selection.from).toBe(
      content.indexOf("## Two") + 1
    );
  });
});
