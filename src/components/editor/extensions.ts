import type {
  CommandProps,
  Editor,
  Extensions,
  JSONContent,
} from "@tiptap/core";
import {
  Extension,
  findChildren,
  InputRule,
  markInputRule,
  mergeAttributes,
} from "@tiptap/core";
import { Code } from "@tiptap/extension-code";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Image } from "@tiptap/extension-image";
import type { ImageOptions } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { MarkdownExtensionOptions } from "@tiptap/markdown";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Mapping, StepMap } from "@tiptap/pm/transform";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { Marked } from "marked";
import { encode } from "mdurl";

import { contentOf, hasNumber, hasString } from "@/components/editor/attrs";
import { BoundedTable } from "@/components/editor/bounded-tokenizers";
import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { HtmlBlock, HtmlInline } from "@/components/editor/html-literal";
import { imageNodeView } from "@/components/editor/image-resize";
import { imageTag, imageTagAt } from "@/components/editor/image-tag";
import {
  NoteBulletList,
  NoteListItem,
  NoteOrderedList,
  NoteTaskItem,
  NoteTaskList,
} from "@/components/editor/lists";
import { createNoteMarked } from "@/components/editor/marked-blocks";
import { isRelativeDestination } from "@/core/links";
import type {
  ReadClipboardSource,
  ReadClipboardText,
} from "@/lib/ui/clipboard-source";
import {
  escapeMarkdownLabel,
  escapeMarkdownTitle,
} from "@/lib/utils/attachments";

import { CaretAfterBreak } from "./caret-after-break";
import { codeBlockNodeView, editingCodeBlock } from "./code-block-node-view";
import { CodeBlockTab } from "./code-block-tab";
import { DragSelection } from "./drag-selection";
import { LinkDefinition } from "./link-definition";
import { MarkdownPaste } from "./markdown-paste";
import type { SaveImage } from "./markdown-paste";
import { MoveSelectionKeys } from "./move-selection-keys";
import { SelectionHighlight } from "./selection-highlight";
import { SlashMenu } from "./slash-menu";
import { carryChange } from "./source-change";
import { TableNodeView } from "./table-node-view";
import { isSafeUrl } from "./urls";
import { Wikilink } from "./wikilink";

export interface EditorExtensionOptions {
  getTitles?: () => string[];
  onHistory?: (direction: "undo" | "redo", execute: boolean) => boolean;
  openDiagram?: (svg: SVGSVGElement) => void;
  openImage?: (image: HTMLImageElement) => void;
  placeholderText?: string;
  readClipboardSource?: ReadClipboardSource;
  readClipboardText?: ReadClipboardText;
  resolveImageSrc?: (src: string) => string;
  saveImage?: SaveImage;
}

/**
 * TipTap's `excludes: "_"` refuses a text node holding `code` beside any other
 * mark, which markdown writes freely and the parser builds (`D59`).
 */
const NoteCode = Code.extend({ excludes: "" });

/** marked's GFM `del` takes one tilde or two; TipTap's rules take only two. */
const SINGLE_TILDE = /(?<mark>~(?=[^\s~])(?<text>[^~]*[^\s~])~(?!~))$/u;

const NoteStrike = Strike.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      markInputRule({ find: SINGLE_TILDE, type: this.type }),
    ];
  },
});

/**
 * Keep the paragraph around an image alone in one, and hand every other
 * paragraph to upstream (`D58`).
 *
 * TODO: drop this once `@tiptap/extension-paragraph` stops unwrapping. Through
 * 3.32.0 its `parseMarkdown` returns the bare image for a paragraph holding
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

    return this.parent?.(token, helpers) ?? [];
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
  /** Shows the image bigger; null leaves the image without its open button. */
  openImage: ((image: HTMLImageElement) => void) | null;
  resolveSrc: (src: string) => string;
}

const NoteImage = Image.extend<NoteImageOptions>({
  // A width alone keeps the ratio in every renderer, so nothing writes a height.
  addAttributes() {
    const { height: _height, ...attributes } = this.parent?.() ?? {};

    return attributes;
  },
  addNodeView() {
    return imageNodeView(this.options.resolveSrc, this.options.openImage);
  },
  addOptions() {
    return {
      HTMLAttributes: {},
      ...this.parent?.(),
      openImage: null,
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
  // An `<img>` tag the editor can draw is an image token too, so a width
  // written as HTML reads back the way GitHub and Obsidian read it.
  markdownTokenizer: {
    level: "inline",
    name: "imageTag",
    start: (src: string) => src.search(/<img/iu),
    tokenize: (src: string) => {
      const found = imageTagAt(src);

      return found === null
        ? undefined
        : {
            href: found.image.src,
            raw: found.raw,
            text: found.image.alt,
            title: found.image.title,
            type: "image",
            width: found.image.width,
          };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("image", {
      alt: token.text ?? "",
      src: hasString(token, "href") ? token.href : "",
      title: hasString(token, "title") ? token.title : null,
      width: hasNumber(token, "width") ? token.width : null,
    }),
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
  // Markdown has no size syntax, so a width makes the image an `<img>` tag,
  // the form every renderer honours. The destination is escaped either way.
  renderMarkdown(node) {
    const src = hasString(node.attrs, "src") ? node.attrs.src : "";
    const alt = hasString(node.attrs, "alt") ? node.attrs.alt : "";
    const title = hasString(node.attrs, "title") ? node.attrs.title : "";
    const destination = bareDestination(src);

    if (hasNumber(node.attrs, "width")) {
      return imageTag({
        alt,
        src: destination,
        title: title === "" ? null : title,
        width: node.attrs.width,
      });
    }

    const label = escapeMarkdownLabel(alt);

    return title
      ? `![${label}](${destination} "${escapeMarkdownTitle(title)}")`
      : `![${label}](${destination})`;
  },
  renderText: ({ node }) =>
    hasString(node.attrs, "alt") ? node.attrs.alt : "",
});

// A line that is an `<img>` tag followed only by spaces opens an HTML block
// that swallows the next line, so the break after a sized image is the
// backslash form, which is text after the tag.
const NoteHardBreak = HardBreak.extend({
  renderMarkdown: (_node, _helpers, context) =>
    context.previousNode?.type === "image" &&
    hasNumber(context.previousNode.attrs, "width")
      ? "\\\n"
      : "  \n",
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
        isRelativeDestination(href) || href.startsWith("#")
          ? { "data-note": "" }
          : {}
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
const TEXT_ESCAPE = new Set(["!", "`", "*", "_", "[", "]", "~"]);

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
 * Preferred first: `typed` drops backslashes and entities, `bare` only
 * backslashes, `unencoded` only entities.
 */
const FORMS = ["typed", "bare", "unencoded"] as const;

type Form = (typeof FORMS)[number];

interface RenderedBlock {
  definitions: string;
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

/**
 * A form reads back when it writes the same as the escaped one. Both are
 * followed by the note's definitions, which a bracket left bare could
 * resolve against as a reference link.
 */
function reparses(
  manager: MarkdownConverter,
  definitions: string,
  form: string,
  escaped: string
) {
  const inNote = (text: string) =>
    definitions === "" ? text : `${text}\n\n${definitions}`;

  try {
    return manager.serialize(manager.parse(inNote(form))) === inNote(escaped);
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
  previous: Node | undefined,
  definitions: string
) {
  const hit = rendered.get(node);

  if (
    hit !== undefined &&
    hit.previous === previous &&
    hit.definitions === definitions
  ) {
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
    definitions,
    escaped,
    forms,
    previous,
    readsBack: new Set(
      FORMS.filter(
        (form) =>
          forms[form] === escaped ||
          reparses(manager, definitions, forms[form], escaped)
      )
    ),
  };

  rendered.set(node, block);

  return block;
}

function written(block: RenderedBlock) {
  const form = FORMS.find((candidate) => block.readsBack.has(candidate));

  return form === undefined ? block.escaped : block.forms[form];
}

/** What sat between two blocks in the file, shared by the pair it joined. */
interface Gap {
  text: string;
}

interface Source {
  /** The gap that led here, which only the block that owns it can write. */
  follows: Gap | undefined;
  gap: Gap;
  /** What preceded the first block of the file. */
  lead: string;
  text: string;
}

/**
 * The text each top-level block is written as. A block nobody touched keeps
 * the text the file had, and an edit carries its change into that text.
 */
const sources = new WeakMap<Node, Source>();

function isBlankParagraph(node: Node) {
  return node.type.name === "paragraph" && node.childCount === 0;
}

/** The text after the note's last block, and the blank paragraphs it stands for. */
interface Ending {
  blanks: number;
  text: string;
}

/**
 * The file's ending belongs to the note rather than its last block, so it
 * outlives that block being rewritten or another block following it.
 */
const endings = new WeakMap<Node, Ending | undefined>();

/** The blank paragraphs past the note's last block. */
function closingBlanks(nodes: readonly Node[]) {
  const final = nodes.findLast((node) => !isBlankParagraph(node));

  return final === undefined ? 0 : nodes.length - 1 - nodes.lastIndexOf(final);
}

function isDefinition(node: Node) {
  return node.type.name === "linkDefinition";
}

function parseDefinitions(manager: MarkdownConverter, node: Node) {
  try {
    const parsed = node.type.schema.nodeFromJSON(
      manager.parse(node.textContent)
    );

    return findChildren(parsed, isDefinition).map(
      (definition) => definition.node.textContent
    );
  } catch {
    return [];
  }
}

/**
 * A definition block is an immutable node, so its text parses once however
 * many edits elsewhere ask for the note's definitions.
 */
const parsedDefinitions = new WeakMap<Node, readonly string[]>();

/**
 * The definitions a definition block's text parses to. An edit can leave it
 * holding several, or text that defines nothing.
 */
function definitionsIn(manager: MarkdownConverter, node: Node) {
  const hit = parsedDefinitions.get(node);

  if (hit !== undefined) {
    return hit;
  }

  const texts = parseDefinitions(manager, node);

  parsedDefinitions.set(node, texts);

  return texts;
}

/** The text of every link definition in the note, in document order. */
function definitionsOf(manager: MarkdownConverter, doc: Node) {
  return findChildren(doc, isDefinition)
    .flatMap(({ node }) => definitionsIn(manager, node))
    .join("\n\n");
}

/**
 * The blocks the text of the blocks from top-level index `at` on parses to in
 * this note, or null when it does not.
 */
type BlockParser = (text: string, at: number) => readonly Node[] | null;

/**
 * A reference link resolves against the first definition of its label
 * anywhere in the note, so a block's text is parsed between the definitions
 * that come before it and the ones after, in the file's order. A definition
 * edited into other text defines nothing and is left out. Text that reaches
 * into the definitions, as an unclosed fence does, does not parse.
 */
function blockParser(manager: MarkdownConverter, doc: Node): BlockParser {
  const definitions = findChildren(doc, isDefinition).flatMap(({ node, pos }) =>
    definitionsIn(manager, node).map((text) => ({
      block: doc.resolve(pos).index(0),
      text,
    }))
  );

  return function parse(text, at) {
    // The blocks' own definitions sit in their text, and a repeat after it
    // resolves nothing.
    const before = definitions.flatMap(({ block, text: definition }) =>
      block < at ? [definition] : []
    );

    const after = definitions.flatMap(({ block, text: definition }) =>
      block < at ? [] : [definition]
    );

    try {
      const parsed = doc.type.schema.nodeFromJSON(
        manager.parse([...before, text, ...after].join("\n\n"))
      ).content.content;

      const blocks = parsed.slice(before.length, parsed.length - after.length);

      const around = [
        ...parsed.slice(0, before.length),
        ...parsed.slice(before.length + blocks.length),
      ];

      return around.length === before.length + after.length &&
        around.every(isDefinition)
        ? blocks
        : null;
    } catch {
      return null;
    }
  };
}

type SameBlock = (parsed: Node, node: Node) => boolean;

function withoutDestinations(json: JSONContent): JSONContent {
  return {
    ...json,
    content: json.content?.map(withoutDestinations),
    marks: json.marks?.map((mark) =>
      mark.type === "link"
        ? { ...mark, attrs: { ...mark.attrs, href: null } }
        : mark
    ),
  };
}

/**
 * The same block apart from its links' destinations. While an edit changes
 * the note's definitions, a reference link still holds the old destination
 * until `rereadReferenceLinks` reads its block again.
 */
function isSameBlockButDestinations(parsed: Node, node: Node) {
  return (
    JSON.stringify(withoutDestinations(contentOf(parsed))) ===
    JSON.stringify(withoutDestinations(contentOf(node)))
  );
}

function readsAs(
  parse: BlockParser,
  same: SameBlock,
  text: string,
  at: number,
  nodes: Node[]
) {
  const parsed = parse(text, at);

  return (
    parsed?.length === nodes.length &&
    nodes.every((node, index) => {
      const block = parsed[index];

      return block !== undefined && same(block, node);
    })
  );
}

/** Blank lines beyond the first separator are paragraphs of their own. */
function pastBlankParagraphs(
  doc: Node,
  index: number,
  parsed: readonly Node[] | null
) {
  let at = index;

  while (
    at < doc.childCount &&
    isBlankParagraph(doc.child(at)) &&
    parsed?.[0]?.eq(doc.child(at)) !== true
  ) {
    at += 1;
  }

  return at;
}

/**
 * Pair the file's top-level tokens with the document's blocks. A block keeps
 * its text only when that text, with the note's link definitions, parses back
 * to it.
 */
export function rememberSources(
  manager: MarkdownConverter,
  doc: Node,
  markdown: string
) {
  let index = 0;
  let lead = "";
  let last: { at: number; source: Source } | undefined;
  const parse = blockParser(manager, doc);
  const tokens = manager.instance.lexer(markdown);

  // A replacement reuses the nodes it did not change, whose text may have.
  // oxlint-disable-next-line unicorn/no-array-for-each -- a ProseMirror node, not an array
  doc.forEach((node) => {
    sources.delete(node);
  });

  for (const token of tokens) {
    if (token.type === "space") {
      if (last === undefined) {
        lead += token.raw;
      } else {
        last.source.gap.text += token.raw;
      }

      continue;
    }

    const text = token.raw.replace(/\n+$/u, "");
    // Blank paragraphs hold no definitions, so the index before them places
    // the token's text among the note's definitions as well as its block does.
    const parsed = parse(text, index);
    const at = pastBlankParagraphs(doc, index, parsed);

    const follows =
      parsed !== null &&
      parsed.every(
        (node, offset) => doc.maybeChild(at + offset)?.eq(node) ?? false
      );

    // A token that does not parse most likely stood for one block.
    index = at + (parsed?.length ?? 1);

    // Indented code reads as a list item's continuation once it lands after
    // a list, so it is always written as a fence.
    if (
      !follows ||
      parsed?.length !== 1 ||
      (token.type === "code" && token.codeBlockStyle === "indented")
    ) {
      last = undefined;
      lead = "";
      continue;
    }

    const source: Source = {
      follows: last?.at === at - 1 ? last.source.gap : undefined,
      gap: { text: token.raw.slice(text.length) },
      lead: at === 0 ? lead : "",
      text,
    };

    sources.set(doc.child(at), source);
    last = { at, source };
  }

  const final = tokens.findLastIndex((token) => token.type !== "space");
  const closing = tokens[final];

  // Blank lines past the last block are paragraphs no token claims, so the
  // file's text after that block stands for them.
  if (closing === undefined) {
    endings.delete(doc);
  } else {
    endings.set(doc, {
      blanks: closingBlanks(doc.content.content),
      text: [
        closing.raw.slice(closing.raw.replace(/\n+$/u, "").length),
        ...tokens.slice(final + 1).map((token) => token.raw),
      ].join(""),
    });
  }
}

/** A gap with no blank line in it joins its two blocks once either changes. */
function isLoose(gap: Gap) {
  return gap.text.includes("\n\n");
}

/**
 * Where two block lists differ, when they differ in one edited block only. A
 * new block that already has a source was restored by undo or read again for
 * a changed definition, so it is not an edit.
 */
function editedBlock(old: readonly Node[], now: readonly Node[]) {
  const changed = now.flatMap((node, index) =>
    node !== old[index] && !sources.has(node) ? [index] : []
  );

  return old.length === now.length && changed.length === 1
    ? (changed[0] ?? -1)
    : -1;
}

/** Whether a gap still keeps its two blocks apart once one of them changed. */
function staysApart(
  parse: BlockParser,
  same: SameBlock,
  gap: Gap,
  text: string,
  at: number,
  nodes: Node[]
) {
  return isLoose(gap) || readsAs(parse, same, text, at, nodes);
}

/**
 * Carry an edit of one block into the text that block is written as, so the
 * rest of the block stays as the file had it. A change the text cannot take,
 * or one that reads back as a different block, leaves the block to the
 * serializer.
 */
function carrySource(manager: MarkdownConverter, before: Node, after: Node) {
  const old = before.content.content;
  const now = after.content.content;
  const at = editedBlock(old, now);
  const was = old[at];
  const node = now[at];
  const source = was === undefined ? undefined : sources.get(was);

  if (was === undefined || node === undefined || source === undefined) {
    return;
  }

  const definedBefore = definitionsOf(manager, before);
  const definedAfter = definitionsOf(manager, after);

  const text = carryChange(
    source.text,
    written(renderBlock(manager, was, old[at - 1], definedBefore)),
    written(renderBlock(manager, node, now[at - 1], definedAfter))
  );

  const parse = blockParser(manager, after);

  const same: SameBlock =
    definedBefore === definedAfter
      ? (parsed, block) => parsed.eq(block)
      : isSameBlockButDestinations;

  if (text === null || !readsAs(parse, same, text, at, [node])) {
    return;
  }

  const above = now[at - 1];
  const below = now[at + 1];
  const previous = above === undefined ? undefined : sources.get(above);
  const next = below === undefined ? undefined : sources.get(below);

  sources.set(node, {
    follows:
      source.follows !== undefined &&
      above !== undefined &&
      previous?.gap === source.follows &&
      staysApart(
        parse,
        same,
        source.follows,
        previous.text + source.follows.text + text,
        at - 1,
        [above, node]
      )
        ? source.follows
        : undefined,
    gap:
      below !== undefined &&
      next?.follows === source.gap &&
      staysApart(
        parse,
        same,
        source.gap,
        text + source.gap.text + next.text,
        at,
        [node, below]
      )
        ? source.gap
        : { text: "\n\n" },
    lead: source.lead,
    text,
  });
}

const rereadKey = new PluginKey("rereadReferenceLinks");

/**
 * A reference link takes its destination from a definition, so once an edit
 * changes the note's definitions, a block whose text no longer parses back to
 * it is read again from that text: a link follows its definition's new
 * destination, and one whose definition is gone reads as the text the file
 * holds. Null when no block needs it.
 */
function rereadReferenceLinks(
  manager: MarkdownConverter,
  before: Node,
  state: EditorState
) {
  if (definitionsOf(manager, before) === definitionsOf(manager, state.doc)) {
    return null;
  }

  const parse = blockParser(manager, state.doc);
  const { tr } = state;
  const spans: StepMap[] = [];

  // oxlint-disable-next-line unicorn/no-array-for-each -- a ProseMirror node, not an array
  state.doc.forEach((node, offset, index) => {
    const source = sources.get(node);
    const parsed = source === undefined ? null : parse(source.text, index);
    const [reread] = parsed ?? [];

    if (parsed?.length !== 1 || reread === undefined) {
      return;
    }

    const start = node.content.findDiffStart(reread.content);
    const end = node.content.findDiffEnd(reread.content);

    if (start !== null && end !== null) {
      // A repeat around the change can put the two ends before the start, by
      // the same amount on each side.
      const overlap = Math.max(0, start - Math.min(end.a, end.b));

      spans.push(
        new StepMap([
          tr.mapping.map(offset + 1 + start),
          end.a + overlap - start,
          end.b + overlap - start,
        ])
      );
      // The whole block is replaced so undo puts back the node that holds the
      // block's text. The caret maps through the span alone, since the whole
      // replace would throw it out of the block.
      tr.replaceWith(
        tr.mapping.map(offset),
        tr.mapping.map(offset + node.nodeSize),
        reread
      );
    }
  });

  return tr.docChanged
    ? tr
        .setSelection(
          state.selection.getBookmark().map(new Mapping(spans)).resolve(tr.doc)
        )
        .setMeta(rereadKey, true)
    : null;
}

/** A block read again from its text keeps the text it was read from. */
function keepRereadSources(before: Node, after: Node) {
  for (const [index, node] of after.content.content.entries()) {
    const source = sources.get(before.child(index));

    if (source !== undefined && node !== before.child(index)) {
      sources.set(node, source);
    }
  }
}

/**
 * The form that goes to the file. Upstream escapes ``\ ` * _ [ ] ~`` and
 * encodes `& < >` in every text node, and escapes a `!` before any `[`, with
 * no regard for context. Re-parsing
 * the stripped text leaves marked the authority on which escape was
 * load-bearing, per top-level block: a construct that needs its backslash
 * keeps every other backslash in its block, and an entity likewise.
 *
 * Blocks parse apart once a blank line separates them. A bracket left bare
 * could still resolve against a link definition elsewhere in the note, so the
 * check parses each form with the note's definitions after it.
 *
 * A block nobody touched is written as the file had it instead.
 */
export function fileMarkdown(manager: MarkdownConverter, doc: Node) {
  const nodes = doc.content.content;
  const definitions = definitionsOf(manager, doc);

  const pieces = nodes.map(
    (node, index) =>
      sources.get(node) ??
      renderBlock(manager, node, nodes[index - 1], definitions)
  );

  const final = nodes.findLast((node) => !isBlankParagraph(node));
  const blocks = final === undefined ? 0 : nodes.lastIndexOf(final) + 1;
  const blanks = closingBlanks(nodes);
  const ending = endings.get(doc);
  // The file's closing text stands for the blank paragraphs it had. Blank
  // paragraphs added at the end are not written, while removing one the file
  // had leaves the end to the serializer, short of the newline that ended the
  // file's last line.
  const closes = ending !== undefined && blanks >= ending.blanks;
  const closing = closes ? ending.text : (ending?.text.slice(0, 1) ?? "");

  // The editor adds an empty paragraph after a closing block other than a
  // paragraph only when nothing follows it, so a lone blank there is the
  // editor's and more than one are the file's.
  const withBlanks =
    blanks === 1 && final?.type.name !== "paragraph" ? blocks : blocks + blanks;

  const markdown = pieces
    .slice(0, closes ? blocks : withBlanks)
    .map((piece, index, kept) => {
      const next = kept[index + 1];
      const end = next === undefined ? closing : "\n\n";

      if (!("gap" in piece)) {
        return written(piece) + end;
      }

      const lead = index === 0 ? piece.lead : "";

      const follows =
        next !== undefined && "gap" in next && next.follows === piece.gap;

      return lead + piece.text + (follows ? piece.gap.text : end);
    })
    .join("");

  // Upstream writes nothing for a document holding only spaces and `&nbsp;`.
  return markdown.replaceAll("&nbsp;", "").replaceAll(" ", "").trim() === ""
    ? ""
    : markdown;
}

/**
 * The form a copy puts in plain text. The file keeps a run of blank paragraphs
 * as `&nbsp;`, which a plain-text target shows literally, so each is a blank
 * block here.
 */
export function copiedMarkdown(manager: MarkdownConverter, doc: Node) {
  const definitions = definitionsOf(manager, doc);

  return doc.content.content
    .map((node, index, siblings) =>
      isBlankParagraph(node)
        ? ""
        : written(renderBlock(manager, node, siblings[index - 1], definitions))
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
 * instance (through 3.32.0 it does not).
 */
const NoteMarkdown = Markdown.extend<
  Omit<MarkdownExtensionOptions, "marked"> & { marked: Marked }
>({
  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        appendTransaction: (transactions, before, after) =>
          transactions.some(
            (tr) => tr.docChanged && tr.getMeta("addToHistory") !== false
          )
            ? rereadReferenceLinks(converterOf(editor), before.doc, after)
            : null,
        state: {
          apply: (transaction, _value, before, after) => {
            // A carry that throws leaves the block to the serializer, which
            // raises the same failure where the save can report it; a throw
            // here would drop the keystroke instead.
            if (transaction.docChanged) {
              endings.set(after.doc, endings.get(before.doc));

              try {
                if (transaction.getMeta(rereadKey) === true) {
                  keepRereadSources(before.doc, after.doc);
                } else {
                  carrySource(converterOf(editor), before.doc, after.doc);
                }
              } catch {
                // See above.
              }
            }

            return null;
          },
          init: () => null,
        },
      }),
    ];
  },
});

/** The full extension stack, shared by the component and headless tests. */
export function createEditorExtensions(
  options: EditorExtensionOptions
): Extensions {
  return [
    StarterKit.configure({
      bulletList: false,
      code: false,
      codeBlock: false,
      // Draws during a DOM `dragover`, which the window's file drop handling
      // never lets reach the page. `DragSelection` marks its own drops.
      dropcursor: false,
      hardBreak: false,
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
    NoteHardBreak,
    HtmlBlock,
    HtmlInline,
    LinkDefinition,
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
    CodeBlockShiki.extend({
      addNodeView() {
        return (props) => codeBlockNodeView(props, options.openDiagram ?? null);
      },
      addProseMirrorPlugins() {
        return [...(this.parent?.() ?? []), editingCodeBlock];
      },
    }),
    CodeBlockTab,
    // Tiptap runs plugins from the end of this list, so the table, below,
    // fills a pasted cell or cell selection before MarkdownPaste's
    // `handlePaste` reads the paste.
    MarkdownPaste.configure({
      readClipboardSource: options.readClipboardSource ?? null,
      readClipboardText: options.readClipboardText ?? null,
      saveImage: options.saveImage ?? null,
    }),
    TableKit.configure({ table: false }),
    BoundedTable.extend({
      addNodeView() {
        return ReactNodeViewRenderer(TableNodeView, {
          className: "tableWrapper",
          contentDOMElementTag: "tbody",
        });
      },
    }).configure({ resizable: false }),
    NoteBulletList,
    NoteOrderedList,
    NoteTaskList,
    NoteTaskItem.configure({ nested: true }),
    NoteImage.configure({
      // Markdown images are inline; the block default breaks a paragraph (`D58`).
      inline: true,
      openImage: options.openImage ?? null,
      resolveSrc: options.resolveImageSrc ?? ((src: string) => src),
    }),
    Placeholder.configure({
      placeholder: options.placeholderText ?? "write another note...",
    }),
    // Lists, tables and code blocks take Tab first. Anywhere else the browser
    // would move focus out of the note, so the key is kept.
    Extension.create({
      addKeyboardShortcuts: () => ({
        "Shift-Tab": () => true,
        Tab: () => true,
      }),
      name: "keepTab",
      priority: 1,
    }),
    CaretAfterBreak,
    DragSelection,
    MarkdownLinkInputRule,
    MoveSelectionKeys,
    SelectionHighlight,
    SlashMenu,
    Wikilink.configure({
      getTitles: options.getTitles ?? (() => []),
    }),
  ];
}
