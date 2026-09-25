import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Fragment, Slice } from "@tiptap/pm/model";
import type { SelectionBookmark } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { toast } from "@/components/ui/toast";
import type { ReadClipboardSource } from "@/lib/ui/clipboard-source";
import { reasonOf } from "@/lib/ui/failure";

interface PendingPaste {
  selection: SelectionBookmark;
}

interface MarkdownPasteOptions {
  readClipboardSource: ReadClipboardSource | null;
}

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|^ {0,3}(?:`{3,}|~{3,})|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\|/mu;

function containsCodeBlock(content: Fragment): boolean {
  return content.content.some(
    (node) => node.type.spec.code === true || containsCodeBlock(node.content)
  );
}

async function pasteBySource(
  editor: Editor,
  readClipboardSource: ReadClipboardSource,
  text: string,
  markdown: boolean,
  slice: Slice,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    const [source] = await Promise.all([readClipboardSource(text), previous]);

    if (editor.isDestroyed) {
      return;
    }

    const chain = editor.chain().command(({ tr }) => {
      tr.setSelection(paste.selection.resolve(tr.doc));
      tr.setMeta("paste", true).setMeta("uiEvent", "paste");
      return true;
    });

    if (source?.kind === "code") {
      chain
        .insertContent({
          attrs: { language: source.language },
          content: [{ text: text.replaceAll(/\r\n?/gu, "\n"), type: "text" }],
          type: "codeBlock",
        })
        .run();
    } else if (editor.markdown && markdown && source === null) {
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

/** Parse markdown only when neither the HTML nor the clipboard's source says otherwise. */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  addOptions() {
    return { readClipboardSource: null };
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
              view.state.selection.$from.parent.type.spec.code === true ||
              containsCodeBlock(slice.content)
            ) {
              return false;
            }

            const text = event.clipboardData?.getData("text/plain");
            const html = event.clipboardData?.getData("text/html") ?? "";
            const manager = this.editor.markdown;

            if (text === undefined || text === "") {
              return false;
            }

            // Rich sources such as browsers, Slack and Docs put their own
            // flattening of the HTML in plain text, and a line in it that
            // looks like markdown is no sign the HTML is.
            const markdown = html === "" && MARKDOWN_PASTE_PATTERN.test(text);

            if (this.options.readClipboardSource !== null) {
              const paste = { selection: view.state.selection.getBookmark() };

              pending.add(paste);
              previous = pasteBySource(
                this.editor,
                this.options.readClipboardSource,
                text,
                markdown,
                slice,
                paste,
                pending,
                previous
              );
              return true;
            }

            if (!(manager && markdown)) {
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
