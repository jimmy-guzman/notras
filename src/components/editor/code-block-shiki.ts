import { findChildren } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { hasString } from "@/components/editor/attrs";
import {
  highlightCode,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";
import type { SyntaxToken } from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

const BACKTICK_RUN = /`+/gu;
const TILDE_RUN = /~+/gu;

interface Highlighted {
  language: string;
  lines: SyntaxToken[][];
  text: string;
}

function isHighlighted(value: unknown): value is Highlighted {
  return typeof value === "object" && value !== null && "lines" in value;
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

function decorationsFor(pos: number, lines: SyntaxToken[][]) {
  return lines.flatMap((line) =>
    line.map((token) =>
      Decoration.inline(
        pos + 1 + token.offset,
        pos + 1 + token.offset + token.length,
        { class: "syntax-token", style: `color: ${token.color}` }
      )
    )
  );
}

/** Colors arrive for a text, so they land on every block still holding that text and nowhere else. */
function applyHighlight(
  doc: Node,
  decorations: DecorationSet,
  { language, lines, text }: Highlighted
) {
  const matching = codeBlocks(doc).filter(
    ({ node }) => node.textContent === text && blockLanguage(node) === language
  );
  const stale = matching.flatMap(
    ({ node, pos }) => decorations.find(pos, pos + node.nodeSize) // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
  );

  return decorations.remove(stale).add(
    doc,
    matching.flatMap(({ pos }) => decorationsFor(pos, lines))
  );
}

/** An edited block keeps its mapped colors until new ones arrive; a block that stopped being highlighted code loses them now. */
function mapChangedDecorations(
  transaction: Transaction,
  decorations: DecorationSet,
  previousDoc: Node
) {
  const obsolete = codeBlocks(previousDoc).flatMap(({ node, pos }) => {
    const mapped = transaction.mapping.mapResult(pos);
    const current = mapped.deleted ? null : transaction.doc.nodeAt(mapped.pos);

    return current !== null && blockLanguage(current) !== undefined
      ? []
      : decorations.find(pos, pos + node.nodeSize); // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
  });

  return decorations.remove(obsolete).map(transaction.mapping, transaction.doc); // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
}

function syntaxPlugin() {
  const key = new PluginKey<DecorationSet>("syntax");

  return new Plugin<DecorationSet>({
    key,
    props: {
      decorations: (state) => key.getState(state),
    },
    state: {
      apply(transaction, decorations, previous) {
        const meta: unknown = transaction.getMeta(key);
        if (isHighlighted(meta)) {
          return applyHighlight(transaction.doc, decorations, meta);
        }

        return transaction.docChanged
          ? mapChangedDecorations(transaction, decorations, previous.doc)
          : decorations.map(transaction.mapping, transaction.doc); // oxlint-disable-line unicorn/no-array-method-this-argument -- a ProseMirror decoration set, not an array
      },
      init: () => DecorationSet.empty,
    },
    view(view: EditorView) {
      let live = true;
      let failed = false;

      async function highlight(language: string, text: string) {
        if (failed) {
          return;
        }
        try {
          const lines = await highlightCode(text, language);
          if (live) {
            view.dispatch(
              view.state.tr
                .setMeta(key, { language, lines, text })
                .setMeta("addToHistory", false)
            );
          }
        } catch (error) {
          failed = true;
          if (live) {
            toast.add({
              description: reasonOf(error),
              title: "could not highlight code",
              type: "error",
            });
          }
        }
      }

      function requestBlocks(blocks: ReturnType<typeof codeBlocks>) {
        for (const { node } of blocks) {
          const language = blockLanguage(node);
          if (language !== undefined) {
            void highlight(language, node.textContent);
          }
        }
      }

      requestBlocks(codeBlocks(view.state.doc));

      return {
        destroy() {
          live = false;
        },
        update(current, previous) {
          if (current.state.doc === previous.doc) {
            return;
          }
          // ProseMirror shares unchanged nodes, even when edits shift their position.
          const unchanged = new Set(
            codeBlocks(previous.doc).map(({ node }) => node)
          );
          requestBlocks(
            codeBlocks(current.state.doc).filter(
              ({ node }) => !unchanged.has(node)
            )
          );
        },
      };
    },
  });
}

/** Highlight code without marks and serialize it inside a noncolliding fence. */
export const CodeBlockShiki = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), syntaxPlugin()];
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
