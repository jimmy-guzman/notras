import type { Editor, Extensions } from "@tiptap/core";

import { Extension, InputRule, mergeAttributes } from "@tiptap/core";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Paragraph } from "@tiptap/extension-paragraph";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Focus, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { encode } from "mdurl";

import { CodeBlockView } from "./code-block-view";
import { SlashMenu } from "./slash-menu";
import { Wikilink } from "./wikilink";

export interface EditorExtensionOptions {
  getTitles?: () => string[];
  placeholderText?: string;
  resolveImageSrc?: (src: string) => string;
}

export const lowlight = createLowlight(common);

/**
 * Let a code span carry the marks around it. TipTap gives the mark
 * `excludes: "_"`, so the schema refuses a text node holding `code` beside any
 * other, while markdown wraps a code span in bold, italic, strike or a link
 * freely. The parser builds the marks the source asks for, `Node.fromJSON`
 * takes that JSON on trust, and the invalid doc throws into the route error
 * boundary the moment it is read. Under the old spec the italic and strike
 * forms also serialized their markers inside the backticks, where markdown
 * reads them as literal characters (`D59`).
 *
 * What it gives up: bold over part of a span, which markdown cannot express,
 * saves with the markers inside the backticks.
 */
const NoteCode = Code.extend({ excludes: "" });

/**
 * Keep the paragraph around an image that is alone in one, and delegate every
 * other paragraph to upstream, the `&nbsp;` empty-paragraph marker that
 * `normalizeMarkdown` depends on included. Owning the token means owning it
 * for rendering too: the render path resolves a node through the parse
 * registry first (`MarkdownManager`'s `getHandlerForToken`), so a second
 * extension claiming the token but carrying no `renderMarkdown` renders every
 * paragraph as an empty string.
 *
 * TODO: drop this once `@tiptap/extension-paragraph` stops unwrapping, or
 * starts asking the schema first. Through 3.30.2 its `parseMarkdown` returns
 * the bare image node for a paragraph holding only one, which suits the block
 * image TipTap ships and leaves an inline one where `doc` cannot hold it
 * (`D58`).
 */
const NoteParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    const tokens = token.tokens ?? [];

    if (tokens.length === 1 && tokens[0]?.type === "image") {
      return helpers.createNode(
        "paragraph",
        undefined,
        helpers.parseInline(tokens)
      );
    }

    return Paragraph.config.parseMarkdown?.(token, helpers) ?? [];
  },
});

/**
 * A bare markdown destination ends at the first space, so a `src` holding one
 * -- what an angle-bracket destination parses to -- gets written back
 * unparseable and reads as text on the next load.
 *
 * mdurl's default exclude set is the URL syntax itself, so a scheme, a query
 * and a fragment survive while a space does not. Non-ASCII does not survive
 * either: a destination carrying it is rewritten percent-encoded on the save
 * after this runs (`D57`). Already-escaped sequences are kept, so the pass is
 * idempotent.
 */
function bareDestination(url: string) {
  return encode(url);
}

const NoteImage = Image.extend<
  Record<string, unknown> & {
    HTMLAttributes: Record<string, unknown>;
    resolveSrc: (src: string) => string;
  }
>({
  addOptions() {
    return {
      HTMLAttributes: {},
      ...this.parent?.(),
      resolveSrc: (src: string) => src,
    };
  },
  renderHTML({ HTMLAttributes }) {
    const src =
      typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";

    // The doc attribute keeps the relative path so markdown serialization
    // stays faithful; only the rendered element gets the resolved URL.
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: this.options.resolveSrc(src),
      }),
    ];
  },
  // Upstream's own shape, with the destination escaped. `this.parent` is bound
  // at runtime but absent from the field's type, and the round-trip spec is
  // what holds this to upstream's output.
  renderMarkdown(node) {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
    const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
    const destination = bareDestination(src);

    return title
      ? `![${alt}](${destination} "${title}")`
      : `![${alt}](${destination})`;
  },
});

const NoteLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href = typeof node.attrs?.href === "string" ? node.attrs.href : "";
    const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
    const text = helpers.renderChildren(node);
    const destination = bareDestination(href);

    return title
      ? `[${text}](${destination} "${title}")`
      : `[${text}](${destination})`;
  },
});

const MARKDOWN_LINK = /\[([^\]]+)\]\(([^\s)]+)\)$/;

/** Typing `[text](url)` converts into a real link as you close the paren. */
const MarkdownLinkInputRule = Extension.create({
  addInputRules() {
    return [
      new InputRule({
        find: MARKDOWN_LINK,
        handler: ({ commands, match, range, state }) => {
          const [, text, url] = match;

          if (text === undefined || url === undefined) {
            return;
          }

          commands.command(({ tr }) => {
            const linkMark = state.schema.marks.link;

            if (linkMark === undefined) {
              return false;
            }

            tr.replaceWith(
              range.from,
              range.to,
              state.schema.text(text, [linkMark.create({ href: url })])
            );

            return true;
          });
        },
      }),
    ];
  },
  name: "markdownLinkInputRule",
});

/**
 * Only ASCII spaces indent a fence, and only three of them: a fourth space or
 * a leading tab makes the line an indented code block instead. Matching the
 * indent here rather than trimming it keeps tabs out.
 */
const FENCE_RUN = /^ {0,3}(`{3,}|~{3,})/;

const BACKTICK_RUN = /^`+/;

/** The fence run opening a line, or null when there is none. */
function fenceRun(line: string) {
  return FENCE_RUN.exec(line)?.[1] ?? null;
}

/**
 * A fence closes only on a bare run of its own character, at least as long as
 * the opener and followed by nothing but whitespace -- an info string
 * (` ```js `) or trailing prose is content, and closing on it would let the
 * rest of the block be scrubbed as prose.
 */
function closesFence(line: string, open: string) {
  const match = FENCE_RUN.exec(line);

  if (match === null) {
    return false;
  }

  const run = match[1] ?? "";

  return (
    run.startsWith(open.charAt(0)) &&
    run.length >= open.length &&
    line.slice(match[0].length).trim() === ""
  );
}

function scrubEntities(text: string) {
  return text.replaceAll(/&nbsp;|&#160;/g, " ");
}

/**
 * Scrub one line's prose, leaving backtick code spans verbatim -- inside a
 * span the entity is content the user typed, not something we generated.
 */
function scrubLine(line: string) {
  let out = "";
  let index = 0;

  while (index < line.length) {
    const tick = line.indexOf("`", index);

    if (tick === -1) {
      return out + scrubEntities(line.slice(index));
    }

    out += scrubEntities(line.slice(index, tick));

    const run = BACKTICK_RUN.exec(line.slice(tick))?.[0] ?? "`";
    const close = line.indexOf(run, tick + run.length);

    if (close === -1) {
      return out + scrubEntities(line.slice(tick));
    }

    out += line.slice(tick, close + run.length);
    index = close + run.length;
  }

  return out;
}

/**
 * Scrub the `&nbsp;` entities TipTap leaks (table cells, blank paragraphs).
 * Every markdown string that could reach a file -- or be compared against one
 * -- goes through here, so the two sides always agree.
 *
 * Code is left alone: the serializer only emits the entity in prose, so inside
 * a fence or a code span it is the author's literal text and rewriting it
 * would silently edit the file. (Raw HTML needs no such guard -- the schema
 * has no HTML node, so none survives to here.)
 */
export function normalizeMarkdown(markdown: string) {
  let fence: null | string = null;

  return markdown
    .split("\n")
    .map((line) => {
      if (fence !== null) {
        if (closesFence(line, fence)) {
          fence = null;
        }

        return line;
      }

      const marker = fenceRun(line);

      if (marker !== null) {
        fence = marker;

        return line;
      }

      return scrubLine(line);
    })
    .join("\n");
}

/** Serialize the editor to markdown for the file on disk. */
export function serializeMarkdown(editor: Editor) {
  return normalizeMarkdown(editor.getMarkdown());
}

/** The full extension stack, shared by the component and headless tests. */
export function createEditorExtensions(
  options: EditorExtensionOptions
): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      paragraph: false,
    }),
    NoteCode,
    NoteLink.configure({ openOnClick: false }),
    NoteParagraph,
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight }),
    TableKit.configure({
      table: {
        HTMLAttributes: { class: "not-typeset" },
        resizable: false,
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoteImage.configure({
      // A markdown image is inline. As TipTap's block default it cannot sit in
      // a paragraph, which is where the parser puts one that shares a line
      // with anything else, and the invalid doc reaches the view (`D58`).
      inline: true,
      resolveSrc: options.resolveImageSrc ?? ((src: string) => src),
    }),
    Placeholder.configure({
      placeholder: options.placeholderText ?? "just write...",
    }),
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    MarkdownLinkInputRule,
    SlashMenu,
    Wikilink.configure({
      getTitles: options.getTitles ?? (() => []),
    }),
  ];
}
