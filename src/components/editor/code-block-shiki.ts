import { findChildren } from "@tiptap/core";
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

interface Range {
  from: number;
  to: number;
}

/** Tokens per line for one code block, keyed to the worker by `id`. */
interface Block {
  id: number;
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
}

type SyntaxMeta = { answer: Answer } | { viewport: Range };

const key = new PluginKey<SyntaxState>("syntax");
let nextBlockId = 0;

function isMeta(value: unknown): value is SyntaxMeta {
  return (
    typeof value === "object" &&
    value !== null &&
    ("answer" in value || "viewport" in value)
  );
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

/** Each block keeps its id and tokens across an edit; one that stopped being highlighted code keeps only its id. */
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
    const block = carried.get(pos) ?? freshBlock();
    return blockLanguage(node) === undefined ? { ...block, tokens: [] } : block;
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
  if ("answer" in meta) {
    const { block: id, lines, start, tail } = meta.answer;
    blocks = blocks.map((block) =>
      block.id === id
        ? {
            id,
            tokens: [
              ...block.tokens.slice(0, start),
              ...lines,
              ...block.tokens.slice(block.tokens.length - tail),
            ],
          }
        : block
    );
  } else {
    ({ viewport } = meta);
  }
  return {
    blocks,
    decorations: buildDecorations(transaction.doc, blocks, viewport),
    viewport,
  };
}

/**
 * The positions on screen, padded by half a window each side, or nothing
 * when no part of the editor shows. The two points sit one pixel inside
 * the editor's visible part: a point outside it sends `posAtCoords` down a
 * fallback that measures the text one character at a time.
 */
function measureViewport(view: EditorView): Range | undefined {
  const { size } = view.state.doc.content;
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
  const from = view.posAtCoords({ left, top })?.pos ?? 0;
  const to = view.posAtCoords({ left, top: bottom })?.pos ?? size;
  return {
    from: Math.max(0, from - WINDOW / 2),
    to: Math.min(size, to + WINDOW / 2),
  };
}

function setViewport(view: EditorView, viewport: Range) {
  view.dispatch(
    view.state.tr.setMeta(key, { viewport }).setMeta("addToHistory", false)
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
      init: (_, state) => ({
        blocks: codeBlocks(state.doc).map(freshBlock),
        decorations: DecorationSet.empty,
        viewport: { from: 0, to: 0 },
      }),
    },
    view(view: EditorView) {
      let live = true;
      let failed = false;
      let frame = 0;

      async function highlight(block: number, language: string, text: string) {
        if (failed) {
          return;
        }
        try {
          const splice = await highlightCode(text, language, block);
          if (live) {
            view.dispatch(
              view.state.tr
                .setMeta(key, { answer: { block, ...splice } })
                .setMeta("addToHistory", false)
            );
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
        }
      }

      function requestChanged(unchanged: Set<Node>) {
        const { blocks } = syntaxState(view.state);
        for (const [index, { node }] of codeBlocks(view.state.doc).entries()) {
          const language = blockLanguage(node);
          const block = blocks[index];
          if (
            language !== undefined &&
            block !== undefined &&
            !unchanged.has(node)
          ) {
            void highlight(block.id, language, node.textContent);
          }
        }
      }

      function followViewport() {
        frame = 0;
        const next = measureViewport(view);
        const { viewport } = syntaxState(view.state);
        if (
          next !== undefined &&
          (Math.abs(next.from - viewport.from) > WINDOW / 4 ||
            Math.abs(next.to - viewport.to) > WINDOW / 4)
        ) {
          setViewport(view, next);
        }
      }

      function scheduleFollow() {
        if (frame === 0) {
          frame = requestAnimationFrame(followViewport);
        }
      }

      function onScroll() {
        if (
          codeBlocks(view.state.doc).some(({ node }) => node.nodeSize > WINDOW)
        ) {
          scheduleFollow();
        }
      }

      requestChanged(new Set());
      scheduleFollow();
      document.addEventListener("scroll", onScroll, {
        capture: true,
        passive: true,
      });

      return {
        destroy() {
          live = false;
          cancelAnimationFrame(frame);
          document.removeEventListener("scroll", onScroll, { capture: true });
        },
        update(current, previous) {
          if (current.state.doc === previous.doc) {
            return;
          }
          // ProseMirror shares unchanged nodes, even when edits shift their position.
          requestChanged(
            new Set(codeBlocks(previous.doc).map(({ node }) => node))
          );
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
