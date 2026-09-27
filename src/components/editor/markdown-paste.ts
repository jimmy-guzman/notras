import type { Editor, JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import type { Fragment, Slice } from "@tiptap/pm/model";
import type { SelectionBookmark } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nullable, object, parse, parseJson, pipe, string } from "valibot";

import { toast } from "@/components/ui/toast";
import type {
  ClipboardSource,
  ReadClipboardSource,
} from "@/lib/ui/clipboard-source";
import { reasonOf } from "@/lib/ui/failure";

interface PendingPaste {
  selection: SelectionBookmark;
}

interface MarkdownPasteOptions {
  readClipboardSource: ReadClipboardSource | null;
}

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*>\s|^ {0,3}(?:`{3,}|~{3,})|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\|/mu;

const EDITOR_METADATA = pipe(
  string(),
  parseJson(),
  object({ mode: nullable(string()) })
);

function containsCodeBlock(content: Fragment): boolean {
  return content.content.some(
    (node) => node.type.spec.code === true || containsCodeBlock(node.content)
  );
}

/** The code editor Chromium names on the event; WebKit omits the format. */
function editorSource(metadata: string): ClipboardSource | null {
  if (metadata === "") {
    return null;
  }
  return {
    kind: "code",
    language: parse(EDITOR_METADATA, metadata, {
      message: "The clipboard metadata is invalid",
    }).mode,
  };
}

/** The content this source pastes, or null to insert the clipboard slice as is. */
function contentBySource(
  editor: Editor,
  source: ClipboardSource | null,
  text: string,
  markdown: boolean
): JSONContent | null {
  if (source?.kind === "code" && source.language !== "markdown") {
    const code = text.replaceAll(/\r\n?/gu, "\n");

    return code.includes("\n")
      ? {
          attrs: { language: source.language },
          content: [{ text: code, type: "text" }],
          type: "codeBlock",
        }
      : { marks: [{ type: "code" }], text: code, type: "text" };
  }
  // A copy out of a markdown file is markdown whatever HTML sits beside it.
  const prose = source === null ? markdown : source.kind === "code";

  return editor.markdown && prose ? editor.markdown.parse(text) : null;
}

async function pasteBySource(
  editor: Editor,
  readClipboardSource: ReadClipboardSource,
  text: string,
  markdown: boolean,
  metadata: string,
  slice: Slice,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    const [source] = await Promise.all([
      editorSource(metadata) ?? readClipboardSource(text),
      previous,
    ]);

    if (editor.isDestroyed) {
      return;
    }

    const content = contentBySource(editor, source, text, markdown);
    const chain = editor.chain().command(({ tr }) => {
      tr.setSelection(paste.selection.resolve(tr.doc));
      tr.setMeta("paste", true).setMeta("uiEvent", "paste");
      return true;
    });

    if (content === null) {
      chain
        .command(({ tr }) => {
          tr.replaceSelection(slice).scrollIntoView();
          return true;
        })
        .run();
    } else {
      chain.insertContent(content).run();
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

/**
 * Paste by the clipboard's source: the editor metadata on the event, the
 * native reader when the webview omits it, and markdown only when neither
 * the HTML nor the source says otherwise.
 */
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

            if (text === undefined || text === "") {
              return false;
            }

            // Rich sources such as browsers, Slack and Docs put their own
            // flattening of the HTML in plain text, and a line in it that
            // looks like markdown is no sign the HTML is.
            const markdown = html === "" && MARKDOWN_PASTE_PATTERN.test(text);
            const metadata =
              event.clipboardData?.getData("vscode-editor-data") ?? "";

            if (this.options.readClipboardSource !== null) {
              const paste = { selection: view.state.selection.getBookmark() };

              pending.add(paste);
              previous = pasteBySource(
                this.editor,
                this.options.readClipboardSource,
                text,
                markdown,
                metadata,
                slice,
                paste,
                pending,
                previous
              );
              return true;
            }

            try {
              const content = contentBySource(
                this.editor,
                editorSource(metadata),
                text,
                markdown
              );

              return (
                content !== null && this.editor.commands.insertContent(content)
              );
            } catch (error) {
              toast.add({
                description: reasonOf(error),
                title: "could not paste",
                type: "error",
              });
              return false;
            }
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
});
