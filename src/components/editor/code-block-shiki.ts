import { findChildren } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { guessEmbeddedLanguages } from "shiki/core";
import type { HighlighterCore } from "shiki/types";

import {
  loadSyntaxHighlighter,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

const BACKTICK_RUN = /`+/g;
const TILDE_RUN = /~+/g;

function codeBlocks(doc: Node) {
  return findChildren(doc, (node) => node.type.name === "codeBlock");
}

function documentLanguages(doc: Node) {
  return codeBlocks(doc).flatMap(({ node }) => {
    const language = syntaxLanguage(node.attrs.language);

    if (language === undefined) {
      return [];
    }

    // Markdown's YAML grammar is needed before a frontmatter block is closed.
    const embedded = guessEmbeddedLanguages(node.textContent, language);
    return [language, ...(language === "markdown" ? ["yaml"] : []), ...embedded]
      .map(syntaxLanguage)
      .filter((name) => name !== undefined);
  });
}

function decorationsFor(
  blocks: ReturnType<typeof codeBlocks>,
  highlighter: HighlighterCore | undefined
) {
  if (highlighter === undefined) {
    return [];
  }

  return blocks.flatMap(({ node, pos }) => {
    const language = syntaxLanguage(node.attrs.language);

    if (
      language === undefined ||
      !highlighter.getLoadedLanguages().includes(language)
    ) {
      return [];
    }

    return highlighter
      .codeToTokensBase(node.textContent, { lang: language, theme: "notras" })
      .flatMap((line) =>
        line
          .filter((token) => token.content.length > 0)
          .map((token) =>
            Decoration.inline(
              pos + 1 + token.offset,
              pos + 1 + token.offset + token.content.length,
              { class: "syntax-token", style: `color: ${token.color}` }
            )
          )
      );
  });
}

function refreshChangedDecorations(
  transaction: Transaction,
  decorations: DecorationSet,
  previousDoc: Node,
  highlighter: HighlighterCore | undefined
) {
  const previousBlocks = codeBlocks(previousDoc).map(({ node, pos }) => {
    const mapped = transaction.mapping.mapResult(pos);

    return {
      mappedPos: mapped.pos,
      node,
      pos,
      // ProseMirror shares unchanged nodes, even when edits shift their position.
      unchanged: !mapped.deleted && transaction.doc.nodeAt(mapped.pos) === node,
    };
  });
  const unchangedPositions = new Set(
    previousBlocks
      .filter((block) => block.unchanged)
      .map((block) => block.mappedPos)
  );
  const obsolete = previousBlocks
    .filter((block) => !block.unchanged)
    .flatMap(({ node, pos }) => decorations.find(pos, pos + node.nodeSize));
  const changed = codeBlocks(transaction.doc).filter(
    ({ pos }) => !unchangedPositions.has(pos)
  );

  return decorations
    .remove(obsolete)
    .map(transaction.mapping, transaction.doc)
    .add(transaction.doc, decorationsFor(changed, highlighter));
}

function syntaxPlugin() {
  const key = new PluginKey<DecorationSet>("syntax");
  let highlighter: HighlighterCore | undefined;
  let loading = false;
  let failed = false;

  async function prepare(view: EditorView) {
    if (loading || failed || view.isDestroyed) {
      return;
    }

    const loaded = new Set(highlighter?.getLoadedLanguages());
    const missing = [...new Set(documentLanguages(view.state.doc))].filter(
      (language) => !loaded.has(language)
    );

    if (missing.length === 0) {
      return;
    }

    loading = true;
    try {
      highlighter = await loadSyntaxHighlighter(missing);
      if (!view.isDestroyed) {
        // A grammar can arrive after edits or a language change. Decorate the
        // current document, never positions captured before the await.
        view.dispatch(
          view.state.tr.setMeta(key, true).setMeta("addToHistory", false)
        );
      }
    } catch (error) {
      failed = true;
      if (!view.isDestroyed) {
        toast.add({
          description: reasonOf(error),
          title: "could not highlight code",
          type: "error",
        });
      }
    } finally {
      loading = false;
    }

    await prepare(view);
  }

  return new Plugin<DecorationSet>({
    key,
    props: {
      decorations: (state) => key.getState(state),
    },
    state: {
      apply(transaction, decorations, previous) {
        if (transaction.getMeta(key)) {
          return DecorationSet.create(
            transaction.doc,
            decorationsFor(codeBlocks(transaction.doc), highlighter)
          );
        }

        return transaction.docChanged
          ? refreshChangedDecorations(
              transaction,
              decorations,
              previous.doc,
              highlighter
            )
          : decorations.map(transaction.mapping, transaction.doc);
      },
      init: () => DecorationSet.empty,
    },
    view(view) {
      prepare(view);

      return {
        update(current, previous) {
          if (!current.state.doc.eq(previous.doc)) {
            prepare(current);
          }
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
    const language = node.attrs?.language ?? "";
    // Backtick fences cannot carry a backtick in their info string.
    const marker = language.includes("`") ? "~" : "`";
    // A literal fence in an example must not close the block enclosing it.
    const length = (
      body.match(marker === "~" ? TILDE_RUN : BACKTICK_RUN) ?? []
    ).reduce((minimum, run) => Math.max(minimum, run.length + 1), 3);
    const fence = marker.repeat(length);

    return [`${fence}${language}`, body, fence].join("\n");
  },
});
