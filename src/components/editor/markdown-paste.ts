import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Fragment, Slice } from "@tiptap/pm/model";
import type { SelectionBookmark } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { toast } from "@/components/ui/toast";
import type { ReadCodeClipboard } from "@/lib/ui/code-clipboard";
import { reasonOf } from "@/lib/ui/failure";

interface PendingPaste {
  selection: SelectionBookmark;
}

interface MarkdownPasteOptions {
  readCodeClipboard: ReadCodeClipboard | null;
}

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|^ {0,3}(?:`{3,}|~{3,})|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\|/m;

function containsCodeBlock(content: Fragment): boolean {
  return content.content.some(
    (node) => node.type.spec.code || containsCodeBlock(node.content)
  );
}

async function pasteNativeCode(
  editor: Editor,
  readCodeClipboard: ReadCodeClipboard,
  text: string,
  slice: Slice,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    const [code] = await Promise.all([readCodeClipboard(text), previous]);

    if (editor.isDestroyed) {
      return;
    }

    const chain = editor.chain().command(({ tr }) => {
      tr.setSelection(paste.selection.resolve(tr.doc));
      tr.setMeta("paste", true).setMeta("uiEvent", "paste");
      return true;
    });

    if (code !== null) {
      chain
        .insertContent({
          attrs: { language: code.language },
          content: [{ text: text.replaceAll(/\r\n?/g, "\n"), type: "text" }],
          type: "codeBlock",
        })
        .run();
    } else if (editor.markdown && MARKDOWN_PASTE_PATTERN.test(text)) {
      chain.insertContent(editor.markdown.parse(text)).run();
    } else {
      chain
        .command(({ tr }) => {
          tr.replaceSelection(slice).scrollIntoView();
          return true;
        })
        .run();
    }
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not paste",
      type: "error",
    });
    await previous;

    if (!editor.isDestroyed) {
      const { state, view } = editor;

      view.dispatch(
        state.tr
          .setSelection(paste.selection.resolve(state.doc))
          .replaceSelection(slice)
          .setMeta("paste", true)
          .setMeta("uiEvent", "paste")
          .scrollIntoView()
      );
    }
  } finally {
    pending.delete(paste);
    await previous;
  }
}

/** Parse markdown only after code-aware clipboard handling has declined it. */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  addOptions() {
    return { readCodeClipboard: null };
  },
  addProseMirrorPlugins() {
    const pending = new Set<PendingPaste>();
    let previous = Promise.resolve();

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (view, event, slice) => {
            if (
              view.state.selection.$from.parent.type.spec.code ||
              containsCodeBlock(slice.content)
            ) {
              return false;
            }

            const text = event.clipboardData?.getData("text/plain");
            const manager = this.editor.markdown;

            if (!text) {
              return false;
            }

            if (this.options.readCodeClipboard !== null) {
              const paste = { selection: view.state.selection.getBookmark() };

              pending.add(paste);
              previous = pasteNativeCode(
                this.editor,
                this.options.readCodeClipboard,
                text,
                slice,
                paste,
                pending,
                previous
              );
              return true;
            }

            if (!(manager && MARKDOWN_PASTE_PATTERN.test(text))) {
              return false;
            }
            return this.editor.commands.insertContent(manager.parse(text));
          },
        },
        state: {
          apply(transaction) {
            for (const paste of pending) {
              paste.selection = paste.selection.map(transaction.mapping);
            }
            return null;
          },
          init: () => null,
        },
      }),
    ];
  },
  name: "markdownPaste",
  // CodeBlock's VS Code handler must see language metadata before markdown
  // punctuation in code can be interpreted as prose.
  priority: 50,
});
