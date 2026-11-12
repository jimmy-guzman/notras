import type { Lang } from "@pierre/highlights";
import { findChildren } from "@tiptap/core";
import type { NodeWithPos } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { hasString } from "./attrs";
import { highlightCode, syntaxLanguage } from "./syntax-highlighter";
import type { SyntaxToken } from "./syntax-highlighter";

const BACKTICK_RUN = /`+/gu;
const TILDE_RUN = /~+/gu;
const LAST_LINE_ENDING = /\n$/u;

/**
 * Characters decorated around what is on screen, half each side. One
 * decoration per token in a 450 KB block took 22 seconds to render.
 */
const WINDOW = 20_000;

interface Range {
  from: number;
  to: number;
}

interface SyntaxState {
  decorations: DecorationSet;
  viewport: Range;
}

const key = new PluginKey<SyntaxState>("syntax");

function isRange(value: unknown): value is Range {
  return typeof value === "object" && value !== null && "from" in value;
}

function codeBlocks(doc: Node) {
  return findChildren(doc, (node) => node.type.name === "codeBlock");
}

function syntaxState(state: EditorState) {
  const value = key.getState(state);

  if (value === undefined) {
    throw new Error("The syntax plugin is not installed");
  }

  return value;
}

/** How far a block sits from a range, zero when it reaches into it. */
function distance({ node, pos }: NodeWithPos, near: Range) {
  return Math.max(near.from - (pos + node.nodeSize), pos - near.to, 0);
}

const tokensByBlock = new WeakMap<Node, SyntaxToken[]>();

/** A block's tokens, kept per node: a node never changes, so neither do they. */
function blockTokens(node: Node, language: Lang) {
  const cached = tokensByBlock.get(node);

  if (cached !== undefined) {
    return cached;
  }

  const tokens = highlightCode(node.textContent, language);
  tokensByBlock.set(node, tokens);

  return tokens;
}

/** Decorations for the tokens of each highlighted block that reach into `viewport`. */
function buildDecorations(doc: Node, viewport: Range) {
  return DecorationSet.create(
    doc,
    codeBlocks(doc).flatMap((found) => {
      const language = syntaxLanguage(
        hasString(found.node.attrs, "language")
          ? found.node.attrs.language
          : undefined
      );

      if (language === undefined || distance(found, viewport) > 0) {
        return [];
      }

      return blockTokens(found.node, language).flatMap(
        ({ color, length, offset }) => {
          const from = found.pos + 1 + offset;
          const to = from + length;

          return to < viewport.from || from > viewport.to
            ? []
            : [
                Decoration.inline(from, to, {
                  class: "syntax-token",
                  style: `color: ${color}`,
                }),
              ];
        }
      );
    })
  );
}

/** ProseMirror shares unchanged nodes, even when edits shift their position. */
function sameCodeBlocks(previousDoc: Node, doc: Node) {
  const previous = codeBlocks(previousDoc);
  const next = codeBlocks(doc);

  return (
    previous.length === next.length &&
    next.every(({ node }, index) => node === previous[index]?.node)
  );
}

function applyTransaction(
  transaction: Transaction,
  state: SyntaxState,
  previousDoc: Node
) {
  const moved: unknown = transaction.getMeta(key);

  if (isRange(moved)) {
    return {
      decorations: buildDecorations(transaction.doc, moved),
      viewport: moved,
    };
  }

  if (!transaction.docChanged) {
    return state;
  }

  const viewport = {
    from: transaction.mapping.map(state.viewport.from),
    to: transaction.mapping.map(state.viewport.to),
  };

  return {
    decorations: sameCodeBlocks(previousDoc, transaction.doc)
      ? // oxlint-disable-next-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
        state.decorations.map(transaction.mapping, transaction.doc)
      : buildDecorations(transaction.doc, viewport),
    viewport,
  };
}

/**
 * The positions on screen, or nothing when no part of the editor shows. The
 * two points sit inside the editor's visible part on both axes: a point
 * outside it sends `posAtCoords` down a fallback that measures the text one
 * character at a time, which a code tab scrolled sideways along a long line
 * would pay on every frame.
 */
export function measureViewport(view: EditorView): Range | undefined {
  const editor = view.dom.getBoundingClientRect();

  const clip = view.dom
    .closest('[data-slot="scroll-area-viewport"]')
    ?.getBoundingClientRect() ?? {
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    top: 0,
  };

  const start = Math.max(editor.left, clip.left);
  const end = Math.min(editor.right, clip.right);
  const left = (start + end) / 2;
  const top = Math.max(editor.top, clip.top) + 1;
  const bottom = Math.min(editor.bottom, clip.bottom) - 1;

  if (bottom <= top || end <= start) {
    return undefined;
  }

  return {
    from: view.posAtCoords({ left, top })?.pos ?? 0,
    to:
      view.posAtCoords({ left, top: bottom })?.pos ??
      view.state.doc.content.size,
  };
}

function setViewport(view: EditorView, viewport: Range) {
  view.dispatch(
    view.state.tr.setMeta(key, viewport).setMeta("addToHistory", false)
  );
}

/**
 * Left to run past the document's ends: clamped to them, a window near an end
 * differs too little from the last one to move, and the code between stays
 * uncolored.
 */
function padded(seen: Range) {
  return { from: seen.from - WINDOW / 2, to: seen.to + WINDOW / 2 };
}

/** Colors what is on screen now, for a view scrolled before its first paint. */
export function windowSyntaxToScreen(view: EditorView): void {
  const seen = measureViewport(view);

  if (seen !== undefined && codeBlocks(view.state.doc).length > 0) {
    setViewport(view, padded(seen));
  }
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
        // A fresh editor opens at the top.
        const viewport = { from: 0, to: WINDOW };

        return {
          decorations: buildDecorations(state.doc, viewport),
          viewport,
        };
      },
    },
    view(view: EditorView) {
      let measured = false;
      let frame = 0;

      function tick() {
        frame = 0;
        const seen = measureViewport(view);

        if (seen === undefined) {
          // Off the DOM, as a React editor is during its first render, nothing
          // measures, and the next frame tries again.
          if (codeBlocks(view.state.doc).length > 0) {
            frame = requestAnimationFrame(tick);
          }

          return;
        }

        measured = true;
        const around = padded(seen);
        const { viewport } = syntaxState(view.state);

        if (
          Math.abs(around.from - viewport.from) > WINDOW / 4 ||
          Math.abs(around.to - viewport.to) > WINDOW / 4
        ) {
          setViewport(view, around);
        }
      }

      function schedule() {
        if (frame === 0) {
          frame = requestAnimationFrame(tick);
        }
      }

      /** Another tab's scroller moves nothing on this screen. */
      function onScroll({ target }: Event) {
        if (target instanceof globalThis.Node && target.contains(view.dom)) {
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
          cancelAnimationFrame(frame);
          document.removeEventListener("scroll", onScroll, { capture: true });
        },
        update(current, previous) {
          // A view with no code to measure for stopped trying.
          if (!measured && current.state.doc !== previous.doc) {
            schedule();
          }
        },
      };
    },
  });
}

/** Highlight code without marks and serialize it inside a noncolliding fence. */
export const CodeBlockSyntax = CodeBlock.extend({
  addProseMirrorPlugins() {
    // CodeBlock's only plugin pastes editor metadata as a block, and
    // MarkdownPaste owns that metadata.
    return [syntaxPlugin()];
  },
  /**
   * TODO: drop this once marked trims indented code again. Through 18.1.1 an
   * indented block with no blank line after it keeps its last line ending in
   * its text, which the fence it is written as would show as a blank line.
   */
  parseMarkdown(token, helpers) {
    const trimmed =
      token.codeBlockStyle === "indented"
        ? { ...token, text: token.text?.replace(LAST_LINE_ENDING, "") }
        : token;

    if (!this.parent) {
      throw new Error("CodeBlock has no markdown parser to extend");
    }

    return this.parent(trimmed, helpers);
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
