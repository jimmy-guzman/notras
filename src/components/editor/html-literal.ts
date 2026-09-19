import { Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Lexer } from "marked";

function textOf(node: JSONContent) {
  return (node.content ?? []).map((child) => child.text ?? "").join("");
}

const TAG = Lexer.rules.inline.gfm.tag;
const TAG_NAME = /^<\/?(?<name>[a-zA-Z][\w-]*)/u;
const BACKTICK_RUN = /^`+/u;
const TRAILING_NEWLINES = /\n+$/u;

/** Elements that never take a closing tag, per the HTML standard. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

function tagName(tag: string) {
  return TAG_NAME.exec(tag)?.groups?.name?.toLowerCase();
}

/**
 * Where the pair opened by the tag at `from` closes, or `from` when it never
 * does. A code span is skipped, since a tag inside one is text.
 */
function pairEnd(src: string, from: number, name: string) {
  let depth = 1;
  let index = from;

  while (index < src.length) {
    const char = src[index];

    if (char !== "`" && char !== "<") {
      index += 1;
      continue;
    }

    const rest = src.slice(index);

    if (char === "`") {
      const run = BACKTICK_RUN.exec(rest)?.[0] ?? "`";
      // A span closes on a run of the opener's length and no longer.
      const closer = new RegExp(`(?<!\`)${run}(?!\`)`, "gu");

      closer.lastIndex = index + run.length;
      const close = closer.exec(src);

      index = close === null ? index + run.length : close.index + run.length;
      continue;
    }

    const tag = TAG.exec(rest)?.[0];

    if (tag === undefined) {
      index += 1;
      continue;
    }

    if (tagName(tag) === name && !tag.endsWith("/>")) {
      depth += tag.startsWith("</") ? -1 : 1;

      if (depth === 0) {
        return index + tag.length;
      }
    }

    index += tag.length;
  }

  return from;
}

/**
 * The inline HTML at the start of `src`: a matching pair of tags with what
 * sits between them, or a lone tag or comment. The index masks the same span
 * as not prose, so a wikilink inside the pair is a pill on neither side.
 */
function inlineHtmlAt(src: string) {
  const tag = TAG.exec(src)?.[0];
  const name = tag === undefined ? "" : (tagName(tag) ?? "");
  const opens =
    tag !== undefined &&
    !tag.startsWith("<!") &&
    !tag.startsWith("</") &&
    !tag.endsWith("/>") &&
    !VOID_ELEMENTS.has(name);

  return tag === undefined
    ? undefined
    : src.slice(0, opens ? pairEnd(src, tag.length, name) : tag.length);
}

/**
 * Raw HTML in a note is the author's text, so both nodes keep it byte for
 * byte and show it as code. Tiptap would otherwise parse it through the
 * schema, which drops a comment and strips the tags it does not render.
 * `code: true` is what keeps the serializer from escaping the text.
 *
 * The block node takes marked's own `html` token. The inline node cannot:
 * the manager parses inline `html` tokens itself before it looks for a
 * handler, so it matches marked's tag rule first under its own token name.
 */
export const HtmlBlock = Node.create({
  code: true,
  content: "text*",
  group: "block",
  markdownTokenName: "html",
  marks: "",
  name: "htmlBlock",
  parseHTML() {
    return [{ preserveWhitespace: "full", tag: "pre[data-html]" }];
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("htmlBlock", undefined, [
      // The trailing newlines are marked's block separator, not the author's.
      helpers.createTextNode((token.raw ?? "").replace(TRAILING_NEWLINES, "")),
    ]),
  renderHTML: () => ["pre", { "data-html": "" }, 0],
  renderMarkdown: textOf,
  whitespace: "pre",
});

export const HtmlInline = Node.create({
  code: true,
  content: "text*",
  group: "inline",
  inline: true,
  markdownTokenizer: {
    level: "inline",
    name: "htmlInline",
    start: (src: string) => src.indexOf("<"),
    tokenize: (src: string) => {
      const raw = inlineHtmlAt(src);

      return raw === undefined ? undefined : { raw, type: "htmlInline" };
    },
  },
  marks: "",
  name: "htmlInline",
  parseHTML() {
    return [{ tag: "code[data-html]" }];
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("htmlInline", undefined, [
      helpers.createTextNode(token.raw ?? ""),
    ]),
  renderHTML: () => ["code", { "data-html": "" }, 0],
  renderMarkdown: textOf,
});
