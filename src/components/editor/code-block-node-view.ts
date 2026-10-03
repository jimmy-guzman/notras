import { getHTMLFromFragment } from "@tiptap/core";
import type { NodeViewRendererProps } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CheckIcon, CopyIcon } from "lucide-react";
import { createElement, Fragment as ReactFragment } from "react";
import { createRoot } from "react-dom/client";

import { hasString } from "@/components/editor/attrs";
import {
  drawMermaid,
  mermaidSettled,
} from "@/components/editor/mermaid-diagram";
import { codeLanguages } from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

// A block is built inside ProseMirror's own DOM pass, where React cannot
// render, so the two icons are drawn once here and cloned into each block.
// This render is scheduled as the module evaluates, ahead of the app's own.
const icons = document.createElement("div");
createRoot(icons).render(
  createElement(
    ReactFragment,
    null,
    createElement(CopyIcon, { size: 13 }),
    createElement(CheckIcon, { size: 13 })
  )
);

function icon(index: number) {
  const drawn = icons.children[index];
  if (drawn === undefined) {
    throw new Error("The code block icons did not render");
  }

  return drawn.cloneNode(true);
}

function languageOf(node: Node) {
  return hasString(node.attrs, "language") ? node.attrs.language : "";
}

function option(value: string, label: string) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;

  return element;
}

/**
 * Marks the block holding the selection, which opens a `mermaid` fence's
 * folded code while the caret is inside it.
 */
export const editingCodeBlock = new Plugin({
  props: {
    decorations: ({ doc, selection: { $from, $to } }) =>
      $from.sameParent($to) && $from.parent.type.name === "codeBlock"
        ? DecorationSet.create(doc, [
            Decoration.node($from.before(), $from.after(), {
              class: "code-block-editing",
            }),
          ])
        : null,
  },
});

/**
 * Copy a block's code and edit its fence language from a hover toolbar. A
 * `mermaid` fence draws above its code. The block is plain DOM, so it is
 * whole when the document is first laid out.
 */
export function codeBlockNodeView({
  getPos,
  node: mounted,
  view,
}: NodeViewRendererProps): NodeView {
  const dom = document.createElement("div");
  const toolbar = document.createElement("div");
  const copyButton = document.createElement("button");
  const width = document.createElement("span");
  const label = document.createElement("span");
  const select = document.createElement("select");
  const pre = document.createElement("pre");
  const code = document.createElement("code");

  dom.className = "code-block-wrapper";
  toolbar.className = "code-block-toolbar";
  toolbar.contentEditable = "false";
  copyButton.type = "button";
  copyButton.className = "code-block-button";
  copyButton.setAttribute("aria-label", "copy code");
  copyButton.append(icon(0), "copy");
  width.className = "code-block-language-width";
  label.className = "code-block-language-label";
  label.setAttribute("aria-hidden", "true");
  select.className = "code-block-language";
  select.setAttribute("aria-label", "code language");
  width.append(label, select);
  toolbar.append(copyButton, width);
  pre.append(code);
  dom.append(toolbar, pre);

  let node = mounted;
  // Hundreds of blocks would carry hundreds of copies of the list, and every
  // element under a hidden tab is restyled when it shows again.
  let listed = false;
  let diagram: HTMLElement | undefined;
  let copiedTimer: number | undefined;
  let frame: number | undefined;
  let destroyed = false;

  const showLanguage = () => {
    const language = languageOf(node);
    const languageLabel = language === "" ? "plain" : language;
    const known = language === "" || codeLanguages.includes(language);

    label.textContent = languageLabel;
    // A fence can name a language the highlighter does not know. Keep it
    // in the list, or the picker would silently rewrite it to "plain".
    select.replaceChildren(
      ...(listed
        ? [
            option("", "plain"),
            ...(known ? codeLanguages : [...codeLanguages, language])
              .toSorted()
              .map((name) => option(name, name)),
          ]
        : [option(language, languageLabel)])
    );
    select.value = language;
  };

  const showDiagram = () => {
    const next =
      languageOf(node) === "mermaid"
        ? drawMermaid(node.textContent)
        : undefined;

    diagram?.remove();
    diagram = next;
    if (next !== undefined) {
      pre.before(next);
    }
  };

  const showDiagramOnceLoaded = async () => {
    await mermaidSettled;
    if (!destroyed) {
      showDiagram();
    }
  };

  const list = () => {
    if (!listed) {
      listed = true;
      showLanguage();
    }
  };

  const copy = async () => {
    try {
      // A terminal takes the plain code, and an app that pastes rich text
      // takes the HTML as a code block with its language. The code is a Blob
      // because happy-dom reads an empty string as a missing type.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": getHTMLFromFragment(
            Fragment.from(node),
            view.state.schema
          ),
          "text/plain": new Blob([node.textContent], { type: "text/plain" }),
        }),
      ]);
      copyButton.replaceChildren(icon(1), "copied");
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => {
        copyButton.replaceChildren(icon(0), "copy");
      }, 1500);
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not copy the code block",
        type: "error",
      });
    }
  };

  copyButton.addEventListener("click", () => {
    void copy();
  });
  select.addEventListener("focus", list);
  select.addEventListener("pointerenter", list);
  select.addEventListener("change", () => {
    const pos = getPos();
    if (pos !== undefined) {
      view.dispatch(
        view.state.tr.setNodeAttribute(pos, "language", select.value)
      );
    }
  });

  showLanguage();
  showDiagram();
  if (diagram === undefined && languageOf(node) === "mermaid") {
    void showDiagramOnceLoaded();
  }

  return {
    contentDOM: code,
    destroy: () => {
      destroyed = true;
      window.clearTimeout(copiedTimer);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    },
    dom,
    ignoreMutation: (mutation) => !code.contains(mutation.target),
    stopEvent: (event) =>
      event.target instanceof globalThis.Node && toolbar.contains(event.target),
    update: (next) => {
      if (next.type !== node.type) {
        return false;
      }

      const previous = node;
      node = next;
      if (languageOf(previous) !== languageOf(next)) {
        showLanguage();
        showDiagram();
      } else if (
        languageOf(next) === "mermaid" &&
        previous.textContent !== next.textContent
      ) {
        // A keystroke lands before the drawing for it is laid out, and the
        // last drawing stays on screen until then.
        if (frame !== undefined) {
          cancelAnimationFrame(frame);
        }
        frame = requestAnimationFrame(showDiagram);
      }

      return true;
    },
  };
}
