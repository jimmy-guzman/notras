import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { InputRule, mergeAttributes } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import type { Attrs } from "@tiptap/pm/model";
import {
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { CALLOUT_MARKER, CALLOUTS } from "@/core/notes";

import { hasString } from "./attrs";
import { nodeViewIcons } from "./node-view-icons";

type Callout = (typeof CALLOUTS)[number];

const icon = nodeViewIcons<Callout>({
  caution: OctagonAlertIcon,
  important: MessageSquareWarningIcon,
  note: InfoIcon,
  tip: LightbulbIcon,
  warning: TriangleAlertIcon,
});

const TYPED_MARKER = new RegExp(
  String.raw`^\[!(?<type>${CALLOUTS.join("|")})\]\s$`,
  "iu"
);

/**
 * A line that turns the marker line above it into a header: a setext
 * underline, or a one-column table delimiter row.
 */
const HEADER_RULE = /^ {0,3}(?:(?:=+|-+)[ \t]*|\|? *:?-+:? *\|? *)(?:\n|$)/u;

function isCallout(value: unknown): value is Callout {
  return CALLOUTS.some((callout) => callout === value);
}

/** The word a node's callout label shows, or null when it is no callout. */
export function calloutOf(attrs: Attrs | undefined) {
  return hasString(attrs, "callout") && isCallout(attrs.callout)
    ? attrs.callout
    : null;
}

function typeOf(written: string | undefined) {
  const type = written?.toLowerCase();

  return isCallout(type) ? type : null;
}

/**
 * The alert a quote's first block opens with. The source keeps an escaped
 * bracket as text, and the parsed block catches a marker a reference
 * definition turned into a link.
 */
function calloutIn(
  token: MarkdownToken | undefined,
  block: JSONContent | undefined
) {
  const opening = block?.content?.[0];

  return token?.type === "paragraph" &&
    opening?.type === "text" &&
    CALLOUT_MARKER.test(opening.text ?? "")
    ? typeOf(CALLOUT_MARKER.exec(token.raw ?? "")?.groups?.type)
    : null;
}

/**
 * A paragraph's inline content past its marker line, which ends at a soft
 * break inside the text, at a hard break, or with the paragraph.
 */
function pastMarker(content: JSONContent[]) {
  const [first, ...rest] = content;
  const found = CALLOUT_MARKER.exec(first?.text ?? "");

  if (found === null || first === undefined) {
    throw new Error(
      "The callout's first paragraph does not open on its marker"
    );
  }

  const text = first.text?.slice(found[0].length) ?? "";

  if (text !== "") {
    return [{ ...first, text }, ...rest];
  }

  return rest[0]?.type === "hardBreak" ? rest.slice(1) : rest;
}

/** A callout's blocks with the marker line taken off its first paragraph. */
function calloutBody(blocks: JSONContent[]) {
  const [first, ...rest] = blocks;
  const content = pastMarker(first?.content ?? []);
  const body = content.length === 0 ? rest : [{ ...first, content }, ...rest];

  return body.length === 0 ? [{ type: "paragraph" }] : body;
}

function isEmptyParagraph(node: JSONContent) {
  return node.type === "paragraph" && (node.content ?? []).length === 0;
}

/**
 * Whether a callout's first block reads back as written straight under the
 * marker line. Any other block would join the marker's paragraph or turn it
 * into a header, so it needs a blank line between.
 */
function joinsMarker(block: JSONContent | undefined) {
  return (
    block?.type === "paragraph" &&
    !isEmptyParagraph(block) &&
    !HEADER_RULE.test(block.content?.[0]?.text ?? "")
  );
}

function titleRow(callout: Callout) {
  const title = document.createElement("div");
  // Find highlights the word alone, not the icon beside it.
  const word = document.createElement("span");

  word.append(callout);
  title.contentEditable = "false";
  title.dataset.calloutTitle = "";
  title.append(icon(callout), word);

  return title;
}

/**
 * A quote that opens with a GitHub alert marker, `> [!NOTE]`, is a callout:
 * the marker line becomes a title row and the type an attribute, written back
 * as the marker.
 */
export const NoteBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      callout: {
        default: null,
        parseHTML: (element) => {
          const value = element.dataset.callout;

          return isCallout(value) ? value : null;
        },
        renderHTML: (attributes) => {
          const callout = calloutOf(attributes);

          return callout === null ? {} : { "data-callout": callout };
        },
      },
    };
  },

  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      new InputRule({
        find: TYPED_MARKER,
        handler: ({ match, range, state }) => {
          const $from = state.doc.resolve(range.from);
          const quoteDepth = $from.depth - 1;
          const callout = typeOf(match.groups?.type);

          // Left without a step, the text stays as typed.
          if (
            callout !== null &&
            quoteDepth >= 0 &&
            $from.node(quoteDepth).type === this.type &&
            $from.index(quoteDepth) === 0
          ) {
            state.tr
              .delete(range.from, range.to)
              .setNodeAttribute($from.before(quoteDepth), "callout", callout);
          }
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {};

    return {
      ...parent,
      // At the start of a callout, the first Backspace drops the title and
      // keeps the quote, as a heading turns back into a paragraph.
      Backspace: (props) => {
        // Runs ahead of core's Backspace, which would undo a marker just typed.
        if (this.editor.commands.undoInputRule()) {
          return true;
        }

        const { selection } = this.editor.state;
        const { $from } = selection;
        const quoteDepth = $from.depth - 1;

        if (
          selection.empty &&
          $from.parentOffset === 0 &&
          quoteDepth >= 0 &&
          $from.index(quoteDepth) === 0 &&
          $from.node(quoteDepth).type === this.type &&
          calloutOf($from.node(quoteDepth).attrs) !== null
        ) {
          return this.editor.commands.command(({ tr }) => {
            tr.setNodeAttribute($from.before(quoteDepth), "callout", null);

            return true;
          });
        }

        return parent.Backspace?.(props) ?? false;
      },
    };
  },

  parseHTML() {
    return [
      { tag: "blockquote" },
      { ignore: true, tag: "blockquote > [data-callout-title]" },
    ];
  },

  parseMarkdown(token, helpers) {
    const parse = helpers.parseBlockChildren ?? helpers.parseChildren;
    const tokens = token.tokens ?? [];
    const blocks = parse(tokens);
    const callout = calloutIn(tokens[0], blocks[0]);

    return callout === null
      ? helpers.createNode("blockquote", undefined, blocks)
      : helpers.createNode("blockquote", { callout }, calloutBody(blocks));
  },

  renderHTML({ HTMLAttributes, node }) {
    const attributes = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes
    );

    const callout = calloutOf(node.attrs);

    if (callout === null) {
      return ["blockquote", attributes, 0];
    }

    const dom = document.createElement("blockquote");
    const contentDOM = document.createElement("div");

    for (const [name, value] of Object.entries(attributes)) {
      dom.setAttribute(name, String(value));
    }

    dom.append(titleRow(callout), contentDOM);

    return { contentDOM, dom };
  },

  renderMarkdown(node, helpers, context) {
    if (!this.parent) {
      throw new Error("Blockquote has no markdown renderer to extend");
    }

    const callout = calloutOf(node.attrs);
    const quote = this.parent(node, helpers, context);

    if (callout === null) {
      return quote;
    }

    const marker = `> [!${callout.toUpperCase()}]`;
    const content = node.content ?? [];

    if (content.every(isEmptyParagraph)) {
      return marker;
    }

    return joinsMarker(content[0])
      ? `${marker}\n${quote}`
      : `${marker}\n>\n${quote}`;
  },
});
