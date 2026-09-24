import { mergeAttributes, Node } from "@tiptap/core";
import type { Attrs } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { Suggestion } from "@tiptap/suggestion";

import { hasString } from "@/components/editor/attrs";

import type { SuggestionMenuItem } from "./suggestion-menu";
import { SuggestionMenu } from "./suggestion-menu";

const WIKILINK_TOKEN = /^\[\[(?<title>[^\n[\]]+)\]\]/u;

export interface WikilinkOptions {
  /** Live note titles for completion. */
  getTitles: () => string[];
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
 * `[[note title]]` as a first-class inline atom: renders as a pill,
 * serializes back to `[[title]]`, and parses from markdown through a
 * custom marked tokenizer.
 */
export const Wikilink = Node.create<WikilinkOptions>({
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.dataset.wikilink ?? element.textContent,
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
      char: "[[",
      command: ({ editor: instance, props: title, range }) => {
        instance
          .chain()
          .focus()
          .insertContentAt(range, [
            { attrs: { title }, type: this.name },
            { text: " ", type: "text" },
          ])
          .run();
      },
      items: ({ query }) =>
        this.options
          .getTitles()
          .filter((title) => title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8),
      pluginKey: new PluginKey("wikilinkSuggestion"),
      render: () => {
        let menu: null | SuggestionMenu = null;

        return {
          onExit: () => {
            menu?.destroy();
            menu = null;
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              menu?.destroy();
              menu = null;

              return true;
            }

            if (menu === null) {
              return false;
            }

            return menu.handleKey(props.event);
          },
          onStart: (props) => {
            menu = new SuggestionMenu();
            menu.update(toItems(props), props.clientRect?.());
          },
          onUpdate: (props) => {
            menu?.update(toItems(props), props.clientRect?.());
          },
        };
      },
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
    return [{ tag: "span[data-wikilink]" }];
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
      String(node.attrs.title ?? ""),
    ];
  },

  renderMarkdown: (node) => `[[${String(node.attrs?.title ?? "")}]]`,

  renderText: ({ node }) => String(node.attrs.title ?? ""),
});
