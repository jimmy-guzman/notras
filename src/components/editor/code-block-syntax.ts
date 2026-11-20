import type { Lang } from "@pierre/highlights";
import {
  findChildren,
  findChildrenInRange,
  InputRule,
  isNodeActive,
} from "@tiptap/core";
import type { Editor, NodeWithPos } from "@tiptap/core";
import {
  backtickInputRegex,
  CodeBlock,
  tildeInputRegex,
} from "@tiptap/extension-code-block";
import { setBlockType } from "@tiptap/pm/commands";
import type { Node, NodeType } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { contentOf, converterOf, hasString } from "./attrs";
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
        ({ color, font, length, offset }) => {
          const from = found.pos + 1 + offset;
          const to = from + length;

          return to < viewport.from || from > viewport.to
            ? []
            : [
                Decoration.inline(from, to, {
                  class: "syntax-token",
                  style:
                    font === undefined
                      ? `color: ${color}`
                      : `color: ${color}; ${font}`,
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

/** Views a print holds whole while it awaits its dialog, which a scroll or resize must not narrow. */
const revealed = new WeakSet<EditorView>();

/** Every view the plugin draws: an embedded note has a view of its own inside its note's. */
const drawn = new Set<EditorView>();

/**
 * Each view a print is revealing, with how to window again every view revealed
 * inside it. An embed that loads or refreshes during the print's dialog draws a
 * view after the reveal began, which joins it on its first frame on the DOM.
 */
const reveals = new Map<EditorView, (() => void)[]>();

function revealView(view: EditorView) {
  const { viewport } = syntaxState(view.state);
  revealed.add(view);
  setViewport(view, { from: 0, to: view.state.doc.content.size });

  return () => {
    revealed.delete(view);

    // A refreshed embed destroyed this view while the print was open.
    if (!drawn.has(view)) {
      return;
    }

    const seen = measureViewport(view);
    setViewport(view, seen === undefined ? viewport : padded(seen));
  };
}

/**
 * Decorate every block whole, in the view and the notes embedded in it, for a
 * print; the returned function windows what is on screen again.
 */
export function revealSyntax(view: EditorView): () => void {
  const restores = [...drawn].flatMap((each) =>
    view.dom.contains(each.dom) ? [revealView(each)] : []
  );

  reveals.set(view, restores);

  return () => {
    reveals.delete(view);

    for (const restore of restores) {
      restore();
    }
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

        if (revealed.has(view)) {
          return;
        }

        const reveal = [...reveals].find(([root]) =>
          root.dom.contains(view.dom)
        );

        if (reveal !== undefined) {
          reveal[1].push(revealView(view));

          return;
        }

        const seen = measureViewport(view);

        if (seen === undefined) {
          // Off the DOM, as a React editor is during its first render, nothing
          // measures, and the next frame tries again. On the DOM but out of
          // sight, as an embed scrolled past is, the scroll or resize that
          // brings it back measures it.
          if (!view.dom.isConnected && codeBlocks(view.state.doc).length > 0) {
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

      // A pane that changes width rewraps the text, which shows other code at
      // the same scroll offset and reports no scroll.
      const resized = new ResizeObserver(schedule);

      drawn.add(view);
      schedule();
      resized.observe(view.dom);
      document.addEventListener("scroll", onScroll, {
        capture: true,
        passive: true,
      });

      return {
        destroy() {
          drawn.delete(view);
          cancelAnimationFrame(frame);
          resized.disconnect();
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

/**
 * ProseMirror deletes the inline nodes a code block cannot hold when it
 * converts a block, so each one in the blocks the conversion changes is
 * written as its markdown first. A block the conversion skips, such as a list
 * item's paragraph selected beside a plain one, keeps its nodes, by the test
 * `setBlockType` applies. A hard break is the schema's line break replacement,
 * which already turns into a newline.
 */
function spellInlineNodes(editor: Editor, tr: Transaction, type: NodeType) {
  const manager = converterOf(editor);
  const { schema } = tr.doc.type;

  const converted = tr.selection.ranges.flatMap(({ $from, $to }) =>
    findChildrenInRange(
      tr.doc,
      { from: $from.pos, to: $to.pos },
      (node) => node.isTextblock
    ).filter(({ pos }) => {
      const $pos = tr.doc.resolve(pos);

      return $pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, type);
    })
  );

  const spelled = converted.flatMap((block) =>
    findChildren(
      block.node,
      (node) =>
        node.isInline &&
        !node.isText &&
        node.type !== schema.linebreakReplacement
    ).map(({ node, pos }) => ({ node, pos: block.pos + 1 + pos }))
  );

  // A cell selection's ranges need not run in document order, and each edit
  // must leave the positions of the ones still to come intact.
  for (const { node, pos } of spelled.toSorted((a, b) => b.pos - a.pos)) {
    const markdown = manager.serialize(contentOf(node.mark([])));

    // `insertText` collapses a selection that ends where its text ends, which
    // would leave the blocks before that point out of the conversion.
    tr.replaceWith(
      pos,
      pos + node.nodeSize,
      markdown === "" ? [] : schema.text(markdown)
    );
  }
}

/**
 * Highlight code without marks, keep inline nodes as their markdown when a
 * block becomes code, and serialize it inside a noncolliding fence.
 */
export const CodeBlockSyntax = CodeBlock.extend({
  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands, dispatch, state, tr }) => {
          // `setNode` lifts a block that cannot hold code, such as a list
          // item's paragraph, before converting it, and the spelling has to
          // see the lifted block.
          if (!setBlockType(this.type, attributes)(state)) {
            commands.clearNodes();
          }

          if (dispatch) {
            spellInlineNodes(this.editor, tr, this.type);
          }

          return commands.setNode(this.name, attributes);
        },
      toggleCodeBlock:
        (attributes) =>
        ({ commands, state }) =>
          isNodeActive(state, this.name, attributes)
            ? commands.toggleNode(this.name, "paragraph", attributes)
            : commands.setCodeBlock(attributes),
    };
  },
  addInputRules() {
    return [backtickInputRegex, tildeInputRegex].map(
      (find) =>
        new InputRule({
          find,
          handler: ({ can, commands, match, range }) => {
            const attributes =
              match[1] === undefined ? undefined : { language: match[1] };

            if (can().setCodeBlock(attributes)) {
              commands.deleteRange(range);
              commands.setCodeBlock(attributes);
            }
          },
        })
    );
  },
  addProseMirrorPlugins() {
    // CodeBlock's only plugin pastes editor metadata as a block, and
    // MarkdownPaste owns that metadata.
    return [syntaxPlugin()];
  },
  /**
   * The text leaves out the line ending before the closing fence, which
   * `renderMarkdown` writes back. marked keeps it for an indented block with
   * no blank line after it and, since 18.2.1, for a fenced block that ends in
   * a blank line.
   */
  parseMarkdown(token, helpers) {
    if (!this.parent) {
      throw new Error("CodeBlock has no markdown parser to extend");
    }

    return this.parent(
      { ...token, text: token.text?.replace(LAST_LINE_ENDING, "") },
      helpers
    );
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
