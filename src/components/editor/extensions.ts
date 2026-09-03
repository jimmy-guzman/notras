import type { Editor, Extensions } from "@tiptap/core";

import {
  Extension,
  InputRule,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from "@tiptap/core";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Focus, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { encode } from "mdurl";

import {
  escapeMarkdownLabel,
  escapeMarkdownTitle,
} from "@/lib/utils/attachments";

import { CodeBlockView } from "./code-block-view";
import { DragSelection } from "./drag-selection";
import { markdownWithFrontmatter } from "./markdown-frontmatter";
import { MoveSelectionKeys } from "./move-selection-keys";
import { SlashMenu } from "./slash-menu";
import { Wikilink } from "./wikilink";

export interface EditorExtensionOptions {
  getTitles?: () => string[];
  placeholderText?: string;
  resolveImageSrc?: (src: string) => string;
}

export const lowlight = createLowlight({
  ...common,
  markdown: markdownWithFrontmatter,
});

/**
 * TipTap's `excludes: "_"` refuses a text node holding `code` beside any other
 * mark, which markdown writes freely and the parser builds (`D59`).
 */
const NoteCode = Code.extend({ excludes: "" });

/** marked's GFM `del` takes one tilde or two; TipTap's rules take only two. */
const SINGLE_TILDE = /(~(?=[^\s~])([^~]*[^\s~])~(?!~))$/;

const SINGLE_TILDE_PASTE = /(~(?=[^\s~])([^~]*[^\s~])~(?!~))/g;

const NoteStrike = Strike.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      markInputRule({ find: SINGLE_TILDE, type: this.type }),
    ];
  },
  addPasteRules() {
    return [
      ...(this.parent?.() ?? []),
      markPasteRule({ find: SINGLE_TILDE_PASTE, type: this.type }),
    ];
  },
});

/**
 * Keep the paragraph around an image alone in one, and hand every other
 * paragraph to upstream (`D58`).
 *
 * TODO: drop this once `@tiptap/extension-paragraph` stops unwrapping. Through
 * 3.30.2 its `parseMarkdown` returns the bare image for a paragraph holding
 * only one, which suits the block image TipTap ships.
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
 * Escape what cannot sit in a bare destination. mdurl's default set keeps the
 * URL syntax and rewrites non-ASCII (`D57`).
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
  // Upstream's shape with the destination escaped; `this.parent` is untyped here.
  renderMarkdown(node) {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
    const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
    const destination = bareDestination(src);
    const label = escapeMarkdownLabel(alt);

    return title
      ? `![${label}](${destination} "${escapeMarkdownTitle(title)}")`
      : `![${label}](${destination})`;
  },
});

const NoteLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href = typeof node.attrs?.href === "string" ? node.attrs.href : "";
    const title = typeof node.attrs?.title === "string" ? node.attrs.title : "";
    const text = helpers.renderChildren(node);
    const destination = bareDestination(href);

    return title
      ? `[${text}](${destination} "${escapeMarkdownTitle(title)}")`
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
 * Inside a code span the text is content the user typed, not something we
 * generated, so it is copied verbatim.
 */
function mapLine(line: string, transform: (text: string) => string) {
  let out = "";
  let index = 0;

  while (index < line.length) {
    const tick = line.indexOf("`", index);

    if (tick === -1) {
      return out + transform(line.slice(index));
    }

    out += transform(line.slice(index, tick));

    const run = BACKTICK_RUN.exec(line.slice(tick))?.[0] ?? "`";
    const close = line.indexOf(run, tick + run.length);

    if (close === -1) {
      return out + transform(line.slice(tick));
    }

    out += line.slice(tick, close + run.length);
    index = close + run.length;
  }

  return out;
}

function mapProse(markdown: string, transform: (text: string) => string) {
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

      return mapLine(line, transform);
    })
    .join("\n");
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
  return mapProse(markdown, scrubEntities);
}

/** What upstream escapes in a text node, minus the backslash. */
const TEXT_ESCAPE = new Set(["`", "*", "_", "[", "]", "~"]);

/**
 * A `\\` pair is left alone, which keeps `escapeMarkdownTitle`'s output and an
 * author's literal backslash intact.
 */
function dropEscapes(text: string) {
  let out = "";
  let index = 0;

  while (index < text.length) {
    const next = text[index + 1];

    if (text[index] !== "\\" || next === undefined) {
      out += text[index];
      index += 1;
    } else if (next === "\\") {
      out += "\\\\";
      index += 2;
    } else if (TEXT_ESCAPE.has(next)) {
      out += next;
      index += 2;
    } else {
      out += "\\";
      index += 1;
    }
  }

  return out;
}

type MarkdownConverter = NonNullable<Editor["markdown"]>;

/**
 * The form that goes to the file. Upstream escapes ``\ ` * _ [ ] ~`` in every
 * text node with no regard for context, so `snake_case` gains a backslash on
 * its first save. Re-parsing the stripped text leaves marked the authority on
 * which escape was load-bearing, per document: one construct that needs its
 * backslash keeps every other escape in the file with it.
 */
export function fileMarkdown(manager: MarkdownConverter, escaped: string) {
  const bare = mapProse(escaped, dropEscapes);

  if (bare === escaped) {
    return escaped;
  }

  try {
    return normalizeMarkdown(manager.serialize(manager.parse(bare))) === escaped
      ? bare
      : escaped;
  } catch {
    return escaped;
  }
}

/** Serialize the editor to markdown for the file on disk. */
export function serializeMarkdown(editor: Editor) {
  const escaped = normalizeMarkdown(editor.getMarkdown());
  const manager = editor.markdown;

  return manager === undefined ? escaped : fileMarkdown(manager, escaped);
}

/** The full extension stack, shared by the component and headless tests. */
export function createEditorExtensions(
  options: EditorExtensionOptions
): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      // Draws during a DOM `dragover`, which the window's file drop handling
      // never lets reach the page. `DragSelection` marks its own drops.
      dropcursor: false,
      link: false,
      paragraph: false,
      strike: false,
    }),
    // Swapped with NoteCode, a text node carrying both marks serializes its
    // tildes inside the backticks and edits the file on open (`D59`).
    NoteStrike,
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
      // Markdown images are inline; the block default breaks a paragraph (`D58`).
      inline: true,
      resolveSrc: options.resolveImageSrc ?? ((src: string) => src),
    }),
    Placeholder.configure({
      placeholder: options.placeholderText ?? "just write...",
    }),
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    DragSelection,
    MarkdownLinkInputRule,
    MoveSelectionKeys,
    SlashMenu,
    Wikilink.configure({
      getTitles: options.getTitles ?? (() => []),
    }),
  ];
}
