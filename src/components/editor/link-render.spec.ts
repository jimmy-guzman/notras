import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";

/** The stack the other editor specs build, so a real view produces the DOM. */
function render(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  editor.state.doc.check();

  return editor.view.dom.querySelector("a");
}

describe("a rendered link", () => {
  it("should carry no target, which the webview would open itself", () => {
    const anchor = render("[a link](https://example.com)");

    expect(anchor?.getAttribute("target")).toBeNull();
    expect(anchor?.getAttribute("rel")).toBeNull();
  });

  it("should blank the href of a scheme the app will not open", () => {
    expect(render("[refused](vscode://file/tmp)")?.getAttribute("href")).toBe(
      ""
    );
  });

  it("should keep the href of a note it can open", () => {
    expect(render("[a note](other.md)")?.getAttribute("href")).toBe("other.md");
  });
});
