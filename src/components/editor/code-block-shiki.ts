import { findChildren } from "@tiptap/core";
import type { NodeWithPos } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { hasString } from "@/components/editor/attrs";
import {
  highlightCode,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";
import type {
  SyntaxSplice,
  SyntaxToken,
} from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

const BACKTICK_RUN = /`+/gu;
const TILDE_RUN = /~+/gu;

/**
 * Characters decorated around what is on screen. A block no longer than this
 * is decorated whole; a longer one only where the viewport is, since one
 * decoration per token in a 450 KB block took 22 seconds to render.
 */
const WINDOW = 20_000;

/**
 * Characters of code whose tokens outlive their view, so a note shown again
 * asks the worker only for the blocks that changed. A count would let a few
 * whole-note source blocks take unbounded memory.
 */
const REMEMBERED_LIMIT = 4_000_000;

interface Range {
  from: number;
  to: number;
}

/** Tokens per line for one code block, keyed to the worker by `id`. */
interface Block {
  id: number;
  /** The language and text the tokens are for, which is also their key in `remembered`. */
  input?: string;
  tokens: SyntaxToken[][];
}

interface SyntaxState {
  /** One entry per code block, in document order. */
  blocks: Block[];
  decorations: DecorationSet;
  viewport: Range;
}

interface Answer extends SyntaxSplice {
  block: number;
  input: string;
}

interface SyntaxMeta {
  answers: Answer[];
  viewport?: Range;
}

const key = new PluginKey<SyntaxState>("syntax");
let nextBlockId = 0;
const remembered = new Map<string, SyntaxToken[][]>();
let rememberedSize = 0;

function isMeta(value: unknown): value is SyntaxMeta {
  return typeof value === "object" && value !== null && "answers" in value;
}

function freshBlock(): Block {
  nextBlockId += 1;
  return { id: nextBlockId, tokens: [] };
}

function codeBlocks(doc: Node) {
  return findChildren(doc, (node) => node.type.name === "codeBlock");
}

function blockLanguage(node: Node) {
  return node.type.name === "codeBlock"
    ? syntaxLanguage(
        hasString(node.attrs, "language") ? node.attrs.language : undefined
      )
    : undefined;
}

/** What a block's tokens would be for, or nothing for a plain fence. */
function blockInput(node: Node) {
  const language = blockLanguage(node);
  return language === undefined
    ? undefined
    : `${language}\n${node.textContent}`;
}

function remember(input: string, tokens: SyntaxToken[][]) {
  if (remembered.delete(input)) {
    rememberedSize -= input.length;
  }
  remembered.set(input, tokens);
  rememberedSize += input.length;
  for (const [oldest] of remembered) {
    if (rememberedSize <= REMEMBERED_LIMIT) {
      break;
    }
    remembered.delete(oldest);
    rememberedSize -= oldest.length;
  }
}

function syntaxState(state: EditorState) {
  const value = key.getState(state);
  if (value === undefined) {
    throw new Error("The syntax plugin is not installed");
  }
  return value;
}

/** Decorations for the tokens on the lines of a block that reach into `range`. */
function lineDecorations(
  pos: number,
  node: Node,
  tokens: SyntaxToken[][],
  range: Range | undefined
) {
  const text = node.textContent;
  const from = Math.max(pos + 1, range?.from ?? 0);
  const to = Math.min(
    pos + 1 + text.length,
    range?.to ?? Number.POSITIVE_INFINITY
  );
  const decorations: Decoration[] = [];
  let lineStart = pos + 1;
  let index = 0;
  for (const line of tokens) {
    if (lineStart > to) {
      break;
    }
    const newline = text.indexOf("\n", index);
    const lineEnd =
      lineStart + (newline === -1 ? text.length : newline) - index;
    if (lineEnd >= from) {
      for (const token of line) {
        const tokenFrom = lineStart + token.offset;
        const tokenTo = tokenFrom + token.length;
        // Tokens are for the text the worker saw; a line edited since may be shorter.
        if (tokenTo <= lineEnd) {
          decorations.push(
            Decoration.inline(tokenFrom, tokenTo, {
              class: "syntax-token",
              style: `color: ${token.color}`,
            })
          );
        }
      }
    }
    if (newline === -1) {
      break;
    }
    index = newline + 1;
    lineStart = lineEnd + 1;
  }
  return decorations;
}

function buildDecorations(doc: Node, blocks: Block[], viewport: Range) {
  return DecorationSet.create(
    doc,
    codeBlocks(doc).flatMap(({ node, pos }, index) => {
      const block = blocks[index];
      return block === undefined
        ? []
        : lineDecorations(
            pos,
            node,
            block.tokens,
            node.nodeSize > WINDOW ? viewport : undefined
          );
    })
  );
}

/** Each block keeps its id and tokens across an edit; one that stopped being highlighted code starts over, so an answer still in flight for it lands nowhere. */
function carryBlocks(
  transaction: Transaction,
  previousDoc: Node,
  previous: Block[]
) {
  const carried = new Map<number, Block>();
  for (const [index, { pos }] of codeBlocks(previousDoc).entries()) {
    const mapped = transaction.mapping.mapResult(pos);
    const block = previous[index];
    if (!mapped.deleted && block !== undefined) {
      carried.set(mapped.pos, block);
    }
  }
  return codeBlocks(transaction.doc).map(({ node, pos }) => {
    const block = carried.get(pos);
    return block === undefined || blockLanguage(node) === undefined
      ? freshBlock()
      : block;
  });
}

/** Mapped colors stay on an edited block until its answer arrives; a block that lost its tokens loses them now. */
function mapDecorations(
  transaction: Transaction,
  previousDoc: Node,
  previous: Block[],
  next: Block[],
  decorations: DecorationSet
) {
  const kept = new Set(
    next.flatMap(({ id, tokens }) => (tokens.length > 0 ? [id] : []))
  );
  const obsolete = codeBlocks(previousDoc).flatMap(({ node, pos }, index) => {
    const id = previous[index]?.id;
    return id !== undefined && kept.has(id)
      ? []
      : decorations.find(pos, pos + node.nodeSize); // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
  });

  return decorations.remove(obsolete).map(transaction.mapping, transaction.doc); // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
}

function applyTransaction(
  transaction: Transaction,
  state: SyntaxState,
  previousDoc: Node
): SyntaxState {
  let { blocks, decorations, viewport } = state;
  if (transaction.docChanged) {
    const next = carryBlocks(transaction, previousDoc, blocks);
    decorations = mapDecorations(
      transaction,
      previousDoc,
      blocks,
      next,
      decorations
    );
    viewport = {
      from: transaction.mapping.map(viewport.from),
      to: transaction.mapping.map(viewport.to),
    };
    blocks = next;
  }
  const meta: unknown = transaction.getMeta(key);
  if (!isMeta(meta)) {
    return { blocks, decorations, viewport };
  }
  for (const { block: id, input, lines, start, tail } of meta.answers) {
    blocks = blocks.map((block) =>
      block.id === id
        ? {
            id,
            input,
            tokens: [
              ...block.tokens.slice(0, start),
              ...lines,
              ...block.tokens.slice(block.tokens.length - tail),
            ],
          }
        : block
    );
  }
  viewport = meta.viewport ?? viewport;
  return {
    blocks,
    decorations: buildDecorations(transaction.doc, blocks, viewport),
    viewport,
  };
}

/**
 * The positions on screen, or nothing when no part of the editor shows. The
 * two points sit one pixel inside the editor's visible part: a point outside
 * it sends `posAtCoords` down a fallback that measures the text one character
 * at a time.
 */
function measureViewport(view: EditorView): Range | undefined {
  const editor = view.dom.getBoundingClientRect();
  const clip = view.dom
    .closest('[data-slot="scroll-area-viewport"]')
    ?.getBoundingClientRect() ?? { bottom: window.innerHeight, top: 0 };
  const left = editor.left + editor.width / 2;
  const top = Math.max(editor.top, clip.top) + 1;
  const bottom = Math.min(editor.bottom, clip.bottom) - 1;
  if (bottom <= top) {
    return undefined;
  }
  return {
    from: view.posAtCoords({ left, top })?.pos ?? 0,
    to:
      view.posAtCoords({ left, top: bottom })?.pos ??
      view.state.doc.content.size,
  };
}

/** How far a block sits from a range, zero when it reaches into it. */
function distance({ node, pos }: NodeWithPos, near: Range) {
  return Math.max(near.from - (pos + node.nodeSize), pos - near.to, 0);
}

function setViewport(view: EditorView, viewport: Range) {
  view.dispatch(
    view.state.tr
      .setMeta(key, { answers: [], viewport })
      .setMeta("addToHistory", false)
  );
}

/** Decorate every block whole, for a print; the returned function windows them again. */
export function revealSyntax(view: EditorView): () => void {
  const { viewport } = syntaxState(view.state);
  setViewport(view, { from: 0, to: view.state.doc.content.size });
  return () => {
    setViewport(view, viewport);
  };
}

function syntaxPlugin() {
  return new Plugin<SyntaxState>({
    key,
    props: {
      decorations: (state) => key.getState(state)?.decorations,
    },
    state: {
      apply: (transaction, state, previous) =>
        applyTransaction(transaction, state, previous.doc),
      init: (_, state) => {
        const blocks = codeBlocks(state.doc).map(({ node }) => {
          const input = blockInput(node);
          const tokens =
            input === undefined ? undefined : remembered.get(input);
          return tokens === undefined
            ? freshBlock()
            : { ...freshBlock(), input, tokens };
        });
        const viewport = { from: 0, to: 0 };
        return {
          blocks,
          decorations: buildDecorations(state.doc, blocks, viewport),
          viewport,
        };
      },
    },
    view(view: EditorView) {
      let live = true;
      let failed = false;
      let started = false;
      let follow = true;
      let frame = 0;
      let outstanding = 0;
      // A reconfigure that drops the plugin swaps the state before destroying its view.
      let last = view.state;
      const answers: Answer[] = [];

      async function highlight(block: number, language: string, text: string) {
        if (failed) {
          return;
        }
        outstanding += 1;
        try {
          const splice = await highlightCode(text, language, block);
          if (live) {
            answers.push({ block, input: `${language}\n${text}`, ...splice });
          }
        } catch (error) {
          // Every request in flight rejects with the same failure; report it once.
          if (live && !failed) {
            toast.add({
              description: reasonOf(error),
              title: "could not highlight code",
              type: "error",
            });
          }
          failed = true;
        } finally {
          outstanding -= 1;
        }
      }

      /** Ask for the wanted blocks, nearest to `near` first when it is known. */
      function request(
        wanted: (node: Node, block: Block) => boolean,
        near?: Range
      ) {
        const { blocks } = syntaxState(view.state);
        const fences = codeBlocks(view.state.doc).flatMap(
          ({ node, pos }, index) => {
            const block = blocks[index];
            const language = blockLanguage(node);
            return block !== undefined &&
              language !== undefined &&
              wanted(node, block)
              ? [{ block, language, node, pos }]
              : [];
          }
        );
        const ordered =
          near === undefined
            ? fences
            : fences.toSorted((a, b) => distance(a, near) - distance(b, near));
        for (const { block, language, node } of ordered) {
          void highlight(block.id, language, node.textContent);
        }
      }

      /** The frame keeps running while the worker owes an answer. */
      function tick() {
        frame = 0;
        const seen = follow ? measureViewport(view) : undefined;
        // Off the DOM, as a React editor is during its first render, nothing
        // measures, and the next frame tries again.
        follow &&= seen === undefined;
        if (!started) {
          started = true;
          request((node, block) => block.input !== blockInput(node), seen);
        }
        const { viewport } = syntaxState(view.state);
        const padded =
          seen === undefined
            ? undefined
            : {
                from: Math.max(0, seen.from - WINDOW / 2),
                to: Math.min(view.state.doc.content.size, seen.to + WINDOW / 2),
              };
        const moved =
          padded !== undefined &&
          (Math.abs(padded.from - viewport.from) > WINDOW / 4 ||
            Math.abs(padded.to - viewport.to) > WINDOW / 4);
        const landed = answers.splice(0);
        if (landed.length > 0 || moved) {
          view.dispatch(
            view.state.tr
              .setMeta(key, {
                answers: landed,
                viewport: moved ? padded : undefined,
              })
              .setMeta("addToHistory", false)
          );
        }
        if (outstanding > 0) {
          frame = requestAnimationFrame(tick);
        }
      }

      function schedule() {
        if (frame === 0) {
          frame = requestAnimationFrame(tick);
        }
      }

      function onScroll() {
        if (
          codeBlocks(view.state.doc).some(({ node }) => node.nodeSize > WINDOW)
        ) {
          follow = true;
          schedule();
        }
      }

      schedule();
      document.addEventListener("scroll", onScroll, {
        capture: true,
        passive: true,
      });

      return {
        destroy() {
          live = false;
          cancelAnimationFrame(frame);
          document.removeEventListener("scroll", onScroll, { capture: true });
          const { blocks } = syntaxState(last);
          for (const [index, { node }] of codeBlocks(last.doc).entries()) {
            const block = blocks[index];
            if (
              block?.input !== undefined &&
              block.input === blockInput(node)
            ) {
              remember(block.input, block.tokens);
            }
          }
        },
        update(current, previous) {
          last = current.state;
          if (!started || current.state.doc === previous.doc) {
            return;
          }
          // ProseMirror shares unchanged nodes, even when edits shift their position.
          const unchanged = new Set(
            codeBlocks(previous.doc).map(({ node }) => node)
          );
          request((node) => !unchanged.has(node));
          schedule();
        },
      };
    },
  });
}

/** Highlight code without marks and serialize it inside a noncolliding fence. */
export const CodeBlockShiki = CodeBlock.extend({
  addProseMirrorPlugins() {
    const inherited = this.parent?.() ?? [];
    // `extend` copies this method into the child, so an extended node runs it
    // once per level of the chain and would install the plugin twice.
    return inherited.some((plugin) => plugin.spec.key === key)
      ? inherited
      : [...inherited, syntaxPlugin()];
  },
  renderMarkdown(node, helpers) {
    const body = node.content ? helpers.renderChildren(node.content) : "";
    const language = hasString(node.attrs, "language")
      ? node.attrs.language
      : "";
    // Backtick fences cannot carry a backtick in their info string.
    const marker = language.includes("`") ? "~" : "`";
    // A literal fence in an example must not close the block enclosing it.
    const runs = body.match(marker === "~" ? TILDE_RUN : BACKTICK_RUN) ?? [];
    let length = 3;
    for (const run of runs) {
      length = Math.max(length, run.length + 1);
    }
    const fence = marker.repeat(length);

    return [`${fence}${language}`, body, fence].join("\n");
  },
});
