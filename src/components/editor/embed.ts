import { Editor, Node } from "@tiptap/core";
import type { Extensions, NodeViewRenderer } from "@tiptap/core";
import type { Attrs } from "@tiptap/pm/model";
import { FileXIcon } from "lucide-react";

import { hasString } from "./attrs";
import type { ImageSource } from "./image-resize";
import { nodeViewIcons } from "./node-view-icons";

const EMBED_TOKEN = /^!\[\[(?<title>[^\n[\]]+)\]\]/u;

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
    let node = mounted;
    let inner: Editor | null = null;
    let unwatch: (() => void) | null = null;

    const show = (shown: EmbedShown | null) => {
      inner?.destroy();
      inner =
        shown === null || "failure" in shown
          ? null
          : new Editor({
              content: shown.body,
              contentType: "markdown",
              editable: false,
              element: body,
              extensions: extensionsFor(shown.resolveImageSrc),
            });
      reason.textContent =
        shown !== null && "failure" in shown ? shown.failure : "";
      dom.toggleAttribute("data-shown", inner !== null);
      dom.toggleAttribute("data-failed", reason.textContent !== "");
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
        inner?.destroy();
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
    // Above the wikilink's rule, which also matches `span[data-wikilink]`.
    return [{ priority: 60, tag: "span[data-embed]" }];
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
