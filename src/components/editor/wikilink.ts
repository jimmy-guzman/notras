import { mergeAttributes, Node } from "@tiptap/core";
import type { Attrs, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { Suggestion } from "@tiptap/suggestion";

import { isWikilinkTitle, WIKILINK_TOKEN, wikilinkParts } from "@/core/notes";

import { hasString } from "./attrs";
import type { SuggestionMenuItem } from "./suggestion-menu";
import { suggestionMenuOptions } from "./suggestion-menu";

export interface WikilinkOptions {
  /** Live note titles for completion. */
  getTitles: () => string[];
}

/** The title a pill carries; its text is the alias label, so it cannot stand in. */
function pillTitle(element: HTMLElement) {
  const title = element.dataset.wikilink;

  if (title === undefined) {
    throw new Error("A wikilink pill has no data-wikilink");
  }

  return title;
}

/**
 * What a wikilink or an embed reads as in text: a wikilink its pill's label,
 * an embed its link, since an image embed's `|400` is its width.
 */
export function pillText(node: ProseMirrorNode) {
  if (!hasString(node.attrs, "title")) {
    throw new Error(`A ${node.type.name} has no title`);
  }

  const { label, link } = wikilinkParts(node.attrs.title);

  return node.type.name === "embed" ? link : label;
}

function toItems(props: {
  command: (title: string) => void;
  items: string[];
}): SuggestionMenuItem[] {
  return props.items.map((title) => ({
    label: title,
    run: () => {
      props.command(title);
    },
  }));
}

/**
 * `[[note title]]` as a first-class inline atom: renders as a pill showing
 * its alias or else its link, serializes back to `[[title]]` as written, and
 * parses from markdown through a custom marked tokenizer.
 */
export const Wikilink = Node.create<WikilinkOptions>({
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: pillTitle,
        renderHTML: (attributes: Attrs) => ({
          "data-wikilink": hasString(attributes, "title")
            ? attributes.title
            : "",
        }),
      },
    };
  },

  addOptions() {
    return {
      getTitles: () => [],
    };
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    const suggestion: Omit<SuggestionOptions<string, string>, "editor"> = {
      allowSpaces: true,
      allowedPrefixes: [" ", "!"],
      char: "[[",
      command: ({ editor: instance, props: title, range }) => {
        const embeds =
          instance.state.doc.textBetween(range.from - 1, range.from) === "!";

        const chain = instance.chain().focus();

        if (embeds) {
          const $to = instance.state.doc.resolve(range.to);

          const inserted = chain.insertContentAt(
            { from: range.from - 1, to: range.to },
            { attrs: { title }, type: "embed" }
          );

          // An embed fills its line, so typing carries on below it. A space
          // would wrap onto a line of its own and leave the caret beside it.
          ($to.pos === $to.end()
            ? inserted.first(({ commands }) => [
                () => commands.splitListItem("listItem"),
                () => commands.splitListItem("taskItem"),
                () => commands.splitBlock(),
              ])
            : inserted
          ).run();

          return;
        }

        chain
          .insertContentAt(range, [
            { attrs: { title }, type: this.name },
            { text: " ", type: "text" },
          ])
          .run();
      },
      items: ({ query }) =>
        this.options
          .getTitles()
          .filter(
            (title) =>
              isWikilinkTitle(title) &&
              // A title holding `|` would read back as an alias.
              !title.includes("|") &&
              title.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 8),
      pluginKey: new PluginKey("wikilinkSuggestion"),
      ...suggestionMenuOptions(toItems),
    };

    return [Suggestion({ editor, ...suggestion })];
  },

  atom: true,

  group: "inline",

  inline: true,

  markdownTokenName: "wikilink",

  markdownTokenizer: {
    level: "inline",
    name: "wikilink",
    start: (src: string) => src.indexOf("[["),
    tokenize: (src: string) => {
      const match = WIKILINK_TOKEN.exec(src);

      return match === null
        ? undefined
        : { raw: match[0], title: match.groups?.title, type: "wikilink" };
    },
  },

  name: "wikilink",

  parseHTML() {
    // A pasted pill whose title would not read back stays as its words. An
    // embed span only reaches this rule once the embed's own rule refused it,
    // so it stays as its words too rather than turning into a link.
    return [
      {
        getAttrs: (element) =>
          element.dataset.embed === undefined &&
          isWikilinkTitle(pillTitle(element))
            ? null
            : false,
        tag: "span[data-wikilink]",
      },
    ];
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("wikilink", {
      title: hasString(token, "title") ? token.title : "",
    }),

  renderHTML({ HTMLAttributes, node }) {
    // `data-wikilink` comes from the attribute's own renderHTML, so the
    // matching parseHTML can read the title back on an HTML round-trip.
    return [
      "span",
      mergeAttributes({ class: "wikilink" }, HTMLAttributes),
      pillText(node),
    ];
  },

  renderMarkdown: (node) => {
    if (!hasString(node.attrs, "title")) {
      throw new Error("A wikilink has no title");
    }

    return `[[${node.attrs.title}]]`;
  },

  renderText: ({ node }) => pillText(node),
});
