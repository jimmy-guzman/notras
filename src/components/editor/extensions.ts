import type {
  CommandProps,
  Editor,
  Extensions,
  JSONContent,
} from "@tiptap/core";
import {
  Extension,
  InputRule,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from "@tiptap/core";
import { Code } from "@tiptap/extension-code";
import { Image } from "@tiptap/extension-image";
import type { ImageOptions } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { ListItem } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { Focus, Placeholder, UndoRedo } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { MarkdownExtensionOptions } from "@tiptap/markdown";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { Marked } from "marked";
import { encode } from "mdurl";

import { contentOf, hasString } from "@/components/editor/attrs";
import {
  BoundedOrderedList,
  BoundedTable,
  BoundedTaskList,
} from "@/components/editor/bounded-tokenizers";
import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { HtmlBlock, HtmlInline } from "@/components/editor/html-literal";
import { MarkdownPaste } from "@/components/editor/markdown-paste";
import { createNoteMarked } from "@/components/editor/marked-blocks";
import { isRelativeDestination } from "@/core/links";
import type { ReadClipboardSource } from "@/lib/ui/clipboard-source";
import {
  escapeMarkdownLabel,
  escapeMarkdownTitle,
} from "@/lib/utils/attachments";

import { CaretAfterBreak } from "./caret-after-break";
import { CodeBlockView } from "./code-block-view";
import { DragSelection } from "./drag-selection";
import { MoveSelectionKeys } from "./move-selection-keys";
import { SlashMenu } from "./slash-menu";
import { isSafeUrl } from "./urls";
import { Wikilink } from "./wikilink";

export interface EditorExtensionOptions {
  getTitles?: () => string[];
  onHistory?: (direction: "undo" | "redo", execute: boolean) => boolean;
  placeholderText?: string;
  readClipboardSource?: ReadClipboardSource;
  resolveImageSrc?: (src: string) => string;
}

/**
 * TipTap's `excludes: "_"` refuses a text node holding `code` beside any other
 * mark, which markdown writes freely and the parser builds (`D59`).
 */
const NoteCode = Code.extend({ excludes: "" });

/** marked's GFM `del` takes one tilde or two; TipTap's rules take only two. */
const SINGLE_TILDE = /(?<mark>~(?=[^\s~])(?<text>[^~]*[^\s~])~(?!~))$/u;

const SINGLE_TILDE_PASTE = /(?<mark>~(?=[^\s~])(?<text>[^~]*[^\s~])~(?!~))/gu;

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

/** marked reads a marker line that ends in a space as a paragraph. */
const MARKER_LINE_SPACES = /(?<=^\S+) +(?=\n)/u;

/**
 * Lead an item that opens with another block with the empty paragraph the
 * schema requires, and write that paragraph as a bare marker line.
 *
 * TODO: drop the parser once `@tiptap/extension-list` builds a legal item.
 * Through 3.31.3 it keeps a table, fence, quote or list as the item's first
 * child.
 */
const NoteListItem = ListItem.extend({
  parseMarkdown(token, helpers) {
    const item = ListItem.config.parseMarkdown?.(token, helpers) ?? [];

    if (Array.isArray(item) || item.content?.[0]?.type === "paragraph") {
      return item;
    }

    return {
      ...item,
      content: [{ type: "paragraph" }, ...(item.content ?? [])],
    };
  },
  renderMarkdown(node, helpers, context) {
    return (
      ListItem.config.renderMarkdown?.(node, helpers, context) ?? ""
    ).replace(MARKER_LINE_SPACES, "");
  },
});

/**
 * Escape what cannot sit in a bare destination. mdurl's default set keeps the
 * URL syntax and rewrites non-ASCII (`D57`).
 */
function bareDestination(url: string) {
  return encode(url);
}

interface NoteImageOptions extends Partial<ImageOptions> {
  HTMLAttributes: ImageOptions["HTMLAttributes"];
  resolveSrc: (src: string) => string;
}

const NoteImage = Image.extend<NoteImageOptions>({
  addOptions() {
    return {
      HTMLAttributes: {},
      ...this.parent?.(),
      resolveSrc: (src: string) => src,
    };
  },
  // The rendered element's URL only loads inside this app and names the home
  // folder, so a copy carries the note's own destination instead.
  addProseMirrorPlugins() {
    const serializer = DOMSerializer.fromSchema(this.editor.schema);

    return [
      new Plugin({
        key: new PluginKey("imageClipboard"),
        props: {
          clipboardSerializer: new DOMSerializer(
            { ...serializer.nodes, image: (node) => ["img", node.attrs] },
            serializer.marks
          ),
        },
      }),
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const src = hasString(HTMLAttributes, "src") ? HTMLAttributes.src : "";

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
    const src = hasString(node.attrs, "src") ? node.attrs.src : "";
    const alt = hasString(node.attrs, "alt") ? node.attrs.alt : "";
    const title = hasString(node.attrs, "title") ? node.attrs.title : "";
    const destination = bareDestination(src);
    const label = escapeMarkdownLabel(alt);

    return title
      ? `![${label}](${destination} "${escapeMarkdownTitle(title)}")`
      : `![${label}](${destination})`;
  },
  renderText: ({ node }) =>
    hasString(node.attrs, "alt") ? node.attrs.alt : "",
});

const NoteLink = Link.extend({
  /**
   * Upstream renders a rejected href blank, and overriding `renderHTML` to mark
   * a note link dropped that. A note's href comes off disk, so the check is
   * kept here as well as at the click.
   */
  renderHTML({ HTMLAttributes }) {
    const href = hasString(HTMLAttributes, "href") ? HTMLAttributes.href : "";
    const allowed = this.options.isAllowedUri(href, {
      defaultProtocol: this.options.defaultProtocol,
      defaultValidate: (url: string) => isSafeUrl(url),
      protocols: this.options.protocols,
    });

    return [
      "a",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        allowed ? {} : { href: "" },
        isRelativeDestination(href) ? { "data-note": "" } : {}
      ),
      0,
    ];
  },
  renderMarkdown(node, helpers) {
    const href = hasString(node.attrs, "href") ? node.attrs.href : "";
    const title = hasString(node.attrs, "title") ? node.attrs.title : "";
    const text = helpers.renderChildren(node);
    const destination = bareDestination(href);

    return title
      ? `[${text}](${destination} "${escapeMarkdownTitle(title)}")`
      : `[${text}](${destination})`;
  },
});

const MARKDOWN_LINK = /\[(?<text>[^\]]+)\]\((?<url>[^\s)]+)\)$/u;

/** Typing `[text](url)` converts into a real link as you close the paren. */
const MarkdownLinkInputRule = Extension.create({
  addInputRules() {
    return [
      new InputRule({
        find: MARKDOWN_LINK,
        handler: ({ commands, match, range, state }) => {
          const text = match.groups?.text;
          const url = match.groups?.url;

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
const FENCE_RUN = /^ {0,3}(?<run>`{3,}|~{3,})/u;

const BACKTICK_RUN = /^`+/u;

/** The fence run opening a line, or null when there is none. */
function fenceRun(line: string) {
  return FENCE_RUN.exec(line)?.groups?.run ?? null;
}

/**
 * A fence closes only on a bare run of its own character, at least as long as
 * the opener and followed by nothing but whitespace -- an info string
 * (` ```js `) or trailing prose is content, and closing on it would let the
 * rest of the block be unescaped as prose.
 */
function closesFence(line: string, open: string) {
  const match = FENCE_RUN.exec(line);

  if (match === null) {
    return false;
  }

  const run = match.groups?.run ?? "";

  return (
    run.startsWith(open.charAt(0)) &&
    run.length >= open.length &&
    line.slice(match[0].length).trim() === ""
  );
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

interface StandIns {
  amp: string;
  gt: string;
  lt: string;
}

/**
 * Three private-use characters the JSON never holds, standing in for what
 * upstream turns into entities in prose. Icon fonts live in these ranges, so
 * no fixed choice is safe.
 */
function freeStandIns(json: JSONContent[]): StandIns {
  const held = new Set(JSON.stringify(json));
  const free: string[] = [];

  for (let code = 0xf_00_00; code <= 0x10_ff_fd && free.length < 3; code += 1) {
    const char = String.fromCodePoint(code);

    if (!held.has(char)) {
      free.push(char);
    }
  }

  const [amp, lt, gt] = free;

  if (amp === undefined || lt === undefined || gt === undefined) {
    throw new Error("The block holds every private-use character");
  }

  return { amp, gt, lt };
}

function withoutStandIns(markdown: string, standIns: StandIns) {
  return markdown
    .replaceAll(standIns.amp, "&")
    .replaceAll(standIns.lt, "<")
    .replaceAll(standIns.gt, ">");
}

function withStandIns(json: JSONContent, standIns: StandIns) {
  const copy = { ...json };

  if (json.text !== undefined) {
    copy.text = json.text
      .replaceAll("&", standIns.amp)
      .replaceAll("<", standIns.lt)
      .replaceAll(">", standIns.gt);
  }

  if (json.content !== undefined) {
    copy.content = json.content.map((child) => withStandIns(child, standIns));
  }

  return copy;
}

/**
 * The forms a block can take in the file, in the order they are preferred:
 * with neither backslashes nor entities, without backslashes, then without
 * entities. Upstream's own output, with both, always reads back.
 */
const FORMS = ["typed", "bare", "unencoded"] as const;

type Form = (typeof FORMS)[number];

interface RenderedBlock {
  escaped: string;
  forms: Record<Form, string>;
  previous: Node | undefined;
  readsBack: Set<Form>;
}

/**
 * A top-level block is an immutable ProseMirror node, so a block an edit did
 * not touch keeps its identity and its markdown across transactions. A block's
 * markdown reads the block before it (an empty paragraph after another one
 * writes `&nbsp;`), so the entry remembers which one that was.
 */
const rendered = new WeakMap<Node, RenderedBlock>();

function reparses(manager: MarkdownConverter, bare: string, escaped: string) {
  try {
    return manager.serialize(manager.parse(bare)) === escaped;
  } catch {
    return false;
  }
}

function renderInDoc(
  manager: MarkdownConverter,
  json: JSONContent,
  previous: JSONContent | undefined
) {
  const siblings = previous === undefined ? [json] : [previous, json];

  return manager.renderNodeToMarkdown(
    json,
    { content: siblings, type: "doc" },
    siblings.length - 1,
    0
  );
}

function renderBlock(
  manager: MarkdownConverter,
  node: Node,
  previous: Node | undefined
) {
  const hit = rendered.get(node);

  if (hit !== undefined && hit.previous === previous) {
    return hit;
  }

  const json = contentOf(node);
  const before = previous === undefined ? undefined : contentOf(previous);
  const escaped = renderInDoc(manager, json, before);
  const standIns = freeStandIns(before === undefined ? [json] : [before, json]);
  // Code and raw HTML text is written verbatim, so only prose loses entities.
  const unencoded = renderInDoc(
    manager,
    withStandIns(json, standIns),
    before === undefined ? undefined : withStandIns(before, standIns)
  );
  const forms = {
    bare: mapProse(escaped, dropEscapes),
    typed: withoutStandIns(mapProse(unencoded, dropEscapes), standIns),
    unencoded: withoutStandIns(unencoded, standIns),
  };
  const block: RenderedBlock = {
    escaped,
    forms,
    previous,
    readsBack: new Set(
      FORMS.filter(
        (form) =>
          forms[form] === escaped || reparses(manager, forms[form], escaped)
      )
    ),
  };

  rendered.set(node, block);

  return block;
}

function blockMarkdown(manager: MarkdownConverter, doc: Node) {
  const blocks = doc.content.content.map((node, index, siblings) =>
    renderBlock(manager, node, siblings[index - 1])
  );
  const form = FORMS.find((candidate) =>
    blocks.every((block) => block.readsBack.has(candidate))
  );

  return blocks.map((block) =>
    form === undefined ? block.escaped : block.forms[form]
  );
}

/**
 * The form that goes to the file. Upstream escapes ``\ ` * _ [ ] ~`` and
 * encodes `& < >` in every text node with no regard for context. Re-parsing
 * the stripped text leaves marked the authority on which escape was
 * load-bearing, per document: one construct that needs its backslash keeps
 * every other escape in the file with it.
 *
 * Asking per top-level block gives the same answer: blocks parse apart once a
 * blank line separates them, and a link reference definition, the one
 * construct that reaches across, is a block that fails its own check.
 */
export function fileMarkdown(manager: MarkdownConverter, doc: Node) {
  const markdown = blockMarkdown(manager, doc).join("\n\n");

  // Upstream writes nothing for a document holding only spaces and `&nbsp;`.
  return markdown.replaceAll("&nbsp;", "").replaceAll("\u00A0", "").trim() ===
    ""
    ? ""
    : markdown;
}

/**
 * The form a copy puts in plain text. The file keeps a run of blank paragraphs
 * as `&nbsp;`, which a plain-text target shows literally, so each is a blank
 * block here.
 */
export function copiedMarkdown(manager: MarkdownConverter, doc: Node) {
  return blockMarkdown(manager, doc)
    .map((block, index) =>
      doc.child(index).type.name === "paragraph" &&
      doc.child(index).childCount === 0
        ? ""
        : block
    )
    .join("\n\n");
}

export function converterOf(editor: Editor) {
  const manager = editor.markdown;

  if (manager === undefined) {
    throw new Error("The editor has no Markdown converter");
  }

  return manager;
}

/** Serialize the editor to markdown for the file on disk. */
export function serializeMarkdown(editor: Editor) {
  return fileMarkdown(converterOf(editor), editor.state.doc);
}

/**
 * The option is declared as the callable export, though the manager only
 * calls methods a `Marked` instance has too.
 *
 * TODO: drop the widened type once `@tiptap/markdown` accepts a `Marked`
 * instance (through 3.31.3 it does not).
 */
const NoteMarkdown = Markdown.extend<
  Omit<MarkdownExtensionOptions, "marked"> & { marked: Marked }
>();

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
      listItem: false,
      orderedList: false,
      paragraph: false,
      strike: false,
      undoRedo: options.onHistory === undefined ? undefined : false,
    }),
    ...(options.onHistory === undefined
      ? []
      : [
          UndoRedo.extend({
            addCommands: () => ({
              redo:
                () =>
                ({ dispatch, tr }: CommandProps) => {
                  tr.setMeta("preventDispatch", true);
                  return (
                    options.onHistory?.("redo", dispatch !== undefined) ?? false
                  );
                },
              undo:
                () =>
                ({ dispatch, tr }: CommandProps) => {
                  tr.setMeta("preventDispatch", true);
                  return (
                    options.onHistory?.("undo", dispatch !== undefined) ?? false
                  );
                },
            }),
            addProseMirrorPlugins: () => [],
          }),
        ]),
    // Swapped with NoteCode, a text node carrying both marks serializes its
    // tildes inside the backticks and edits the file on open (`D59`).
    NoteStrike,
    NoteCode,
    HtmlBlock,
    HtmlInline,
    // The extension defaults `target` to `_blank` and renders it as a mark
    // attribute, which tells the webview to open a link itself. Every link here
    // goes through `followLink` and its scheme gate instead.
    NoteLink.configure({
      HTMLAttributes: { rel: null, target: null },
      openOnClick: false,
    }),
    NoteParagraph,
    NoteListItem,
    NoteMarkdown.configure({
      marked: createNoteMarked(),
    }),
    MarkdownPaste.configure({
      readClipboardSource: options.readClipboardSource ?? null,
    }),
    CodeBlockShiki.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }),
    TableKit.configure({ table: false }),
    BoundedTable.configure({ resizable: false }),
    BoundedOrderedList,
    BoundedTaskList,
    TaskItem.configure({ nested: true }),
    NoteImage.configure({
      // Markdown images are inline; the block default breaks a paragraph (`D58`).
      inline: true,
      resolveSrc: options.resolveImageSrc ?? ((src: string) => src),
    }),
    Placeholder.configure({
      placeholder: options.placeholderText ?? "write another note...",
    }),
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    CaretAfterBreak,
    DragSelection,
    MarkdownLinkInputRule,
    MoveSelectionKeys,
    SlashMenu,
    Wikilink.configure({
      getTitles: options.getTitles ?? (() => []),
    }),
  ];
}
