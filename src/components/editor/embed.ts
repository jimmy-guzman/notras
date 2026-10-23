import { Node } from "@tiptap/core";
import type { Attrs } from "@tiptap/pm/model";

import { hasString } from "@/components/editor/attrs";

const EMBED_TOKEN = /^!\[\[(?<title>[^\n[\]]+)\]\]/u;

function titleOf(attrs: Attrs | undefined) {
  if (!hasString(attrs, "title")) {
    throw new Error("An embed has no title");
  }

  return attrs.title;
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
