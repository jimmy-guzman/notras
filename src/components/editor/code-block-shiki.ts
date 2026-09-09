import { findChildren } from "@tiptap/core";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node } from "@tiptap/pm/model";
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

function decorationsFor(doc: Node, highlighter: HighlighterCore | undefined) {
  if (highlighter === undefined) {
    return DecorationSet.empty;
  }

  const decorations = codeBlocks(doc).flatMap(({ node, pos }) => {
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

  return DecorationSet.create(doc, decorations);
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
      apply: (transaction, decorations) =>
        transaction.docChanged || transaction.getMeta(key)
          ? decorationsFor(transaction.doc, highlighter)
          : decorations.map(transaction.mapping, transaction.doc),
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
    // A literal fence in an example must not close the block enclosing it.
    const length = (body.match(BACKTICK_RUN) ?? []).reduce(
      (minimum, run) => Math.max(minimum, run.length + 1),
      3
    );
    const fence = "`".repeat(length);

    return [`${fence}${node.attrs?.language ?? ""}`, body, fence].join("\n");
  },
});
