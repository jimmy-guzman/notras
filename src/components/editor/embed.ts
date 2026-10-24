import { Node } from "@tiptap/core";
import type { Extensions, NodeViewRenderer } from "@tiptap/core";
import type { Attrs } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import { FileXIcon } from "lucide-react";
import { createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import { EMBED_TOKEN, isWikilinkTitle } from "@/core/notes";

import { hasString } from "./attrs";
import type { ImageSource } from "./image-resize";
import { nodeViewIcons } from "./node-view-icons";

const icon = nodeViewIcons({ failed: FileXIcon });

function titleOf(attrs: Attrs | undefined) {
  if (!hasString(attrs, "title")) {
    throw new Error("An embed has no title");
  }

  return attrs.title;
}

/** What an embed shows: its note's body and how its images load, or why it cannot show one. */
type EmbedShown =
  | { body: string; resolveImageSrc: (src: string) => ImageSource }
  | { failure: string };

/**
 * Calls `show` with what the embed of a title shows, at once and again
 * whenever it changes, or with null until that is known. Returns what stops
 * the calls.
 */
export type WatchEmbed = (
  title: string,
  show: (shown: EmbedShown | null) => void
) => () => void;

/**
 * The embedded note, drawn by a React editor as the note itself is, so the
 * node views that render through React, tables among them, draw here too.
 */
function EmbeddedBody({
  body,
  extensions,
  onDrawn,
}: {
  body: string;
  extensions: Extensions;
  onDrawn: () => void;
}) {
  const editor = useEditor({
    content: body,
    contentType: "markdown",
    editable: false,
    extensions,
  });

  useLayoutEffect(onDrawn, [onDrawn]);

  return createElement(EditorContent, { editor });
}

/**
 * The embed as its note's body, drawn read-only by an editor of its own, as the
 * reason it cannot show one, or as the pill until either is known. The inner
 * editor takes `extensionsFor`'s extensions, which draw an embed as its pill,
 * so an embed inside an embedded note stays a pill and no chain of embeds can
 * loop back on itself.
 */
export function embedNodeView(
  watch: WatchEmbed,
  extensionsFor: (resolveImageSrc: (src: string) => ImageSource) => Extensions
): NodeViewRenderer {
  return ({ node: mounted }) => {
    const dom = document.createElement("span");
    const pill = document.createElement("span");
    const body = document.createElement("span");
    const failure = document.createElement("span");
    const reason = document.createElement("span");
    const inner = createRoot(body);
    let node = mounted;
    let shows = 0;
    let unwatch: (() => void) | null = null;

    const show = (shown: EmbedShown | null) => {
      const drawn = shown !== null && !("failure" in shown);

      shows += 1;
      const read = shows;

      inner.render(
        drawn
          ? createElement(EmbeddedBody, {
              body: shown.body,
              extensions: extensionsFor(shown.resolveImageSrc),
              // A new read is a new editor, since the editor takes its content once.
              key: read,
              // React commits the body a task after this render; marking the
              // embed shown before then would draw an empty box.
              onDrawn: () => {
                dom.toggleAttribute("data-shown", read === shows);
              },
            })
          : null
      );
      reason.textContent =
        shown !== null && "failure" in shown ? shown.failure : "";
      dom.toggleAttribute("data-failed", reason.textContent !== "");

      if (!drawn) {
        dom.toggleAttribute("data-shown", false);
      }
    };

    const watchTitle = () => {
      const title = titleOf(node.attrs);

      dom.dataset.wikilink = title;
      pill.textContent = title;
      unwatch?.();
      unwatch = watch(title, show);
    };

    dom.className = "embed";
    pill.className = "wikilink";
    body.className = "embed-body";
    failure.className = "embed-failure";
    failure.append(icon("failed"), reason);
    dom.append(pill, body, failure);
    watchTitle();

    return {
      destroy: () => {
        unwatch?.();
        // ProseMirror destroys a node view in its own update, which can run
        // inside the note's React render, where an unmount cannot.
        queueMicrotask(() => {
          inner.unmount();
        });
      },
      dom,
      // Everything under the wrapper is the inner editor's own DOM.
      ignoreMutation: () => true,
      update: (updated) => {
        if (updated.type !== node.type) {
          return false;
        }

        const retitled = titleOf(updated.attrs) !== titleOf(node.attrs);

        node = updated;

        if (retitled) {
          watchTitle();
        }

        return true;
      },
    };
  };
}

/**
 * `![[note title]]` as an inline atom that serializes back to `![[title]]`.
 * It carries `data-wikilink`, so a click opens it and the link hover reads it
 * the way they do a pill.
 */
export const Embed = Node.create({
  addAttributes() {
    return {
      title: {
        parseHTML: (element: HTMLElement) => element.dataset.embed,
        rendered: false,
      },
    };
  },

  atom: true,

  group: "inline",

  inline: true,

  markdownTokenName: "embed",

  markdownTokenizer: {
    level: "inline",
    name: "embed",
    start: (src: string) => src.indexOf("![["),
    tokenize: (src: string) => {
      const match = EMBED_TOKEN.exec(src);

      return match === null
        ? undefined
        : { raw: match[0], title: match.groups?.title, type: "embed" };
    },
  },

  name: "embed",

  parseHTML() {
    // Above the wikilink's rule, which also matches `span[data-wikilink]`. A
    // pasted embed whose title would not read back stays as its words.
    return [
      {
        getAttrs: (element) =>
          element.dataset.embed !== undefined &&
          isWikilinkTitle(element.dataset.embed)
            ? null
            : false,
        priority: 60,
        tag: "span[data-embed]",
      },
    ];
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("embed", { title: titleOf(token) }),

  renderHTML({ node }) {
    const title = titleOf(node.attrs);

    return [
      "span",
      { class: "wikilink", "data-embed": title, "data-wikilink": title },
      title,
    ];
  },

  renderMarkdown: (node) => `![[${titleOf(node.attrs)}]]`,

  renderText: ({ node }) => titleOf(node.attrs),
});
