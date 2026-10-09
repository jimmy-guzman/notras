import type { Editor, JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { keydownHandler } from "@tiptap/pm/keymap";
import { DOMParser } from "@tiptap/pm/model";
import type { Fragment, Schema, Slice } from "@tiptap/pm/model";
import type { SelectionBookmark } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nullable, object, parse, parseJson, pipe, string } from "valibot";

import { toast } from "@/components/ui/toast";
import type {
  ClipboardSource,
  ReadClipboardSource,
  ReadClipboardText,
} from "@/lib/ui/clipboard-source";
import { reasonOf } from "@/lib/ui/failure";

import { headingAnchors } from "./heading-anchors";

interface PendingPaste {
  selection: SelectionBookmark;
}

interface MarkdownPasteOptions {
  readClipboardSource: ReadClipboardSource | null;
  readClipboardText: ReadClipboardText | null;
}

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*>\s|^ {0,3}(?:`{3,}|~{3,})|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|(?:^|[^`])`[^`\n]+`(?!`)|(?:^|[\s(])(?<marker>[*_~])[^\s*_~](?:[^\n]*?\S)?\k<marker>(?![\w*_~])|^\s*[-*_]{3,}\s*$|^\|.+\|/mu;

const EDITOR_METADATA = pipe(
  string(),
  parseJson(),
  object({ mode: nullable(string()) })
);

const HTML_TASK_MARKER = /^\s*\[(?<mark>[ xX])\](?:[ \t]+|$)/u;

interface HtmlTask {
  checked: boolean;
  checkbox: HTMLInputElement | null;
  lead: HTMLElement;
  prefix: number;
}

function firstItemContent(parent: globalThis.Node): Element | Text | null {
  for (const child of parent.childNodes) {
    if (child instanceof Text && child.data.trim() !== "") {
      return child;
    }
    if (child instanceof Element) {
      if (
        child.matches(
          "input, code, pre, ul, ol, img, br, hr, table, blockquote"
        )
      ) {
        return child;
      }
      const content = firstItemContent(child);
      if (content !== null) {
        return content;
      }
    }
  }
  return null;
}

function htmlTaskText(parent: globalThis.Node): string {
  return [...parent.childNodes]
    .map((child) => {
      if (child instanceof Text) {
        return child.data;
      }
      if (child instanceof Element && child.matches("ul, ol")) {
        return "";
      }
      // Inline code is a boundary, even when its text completes a marker.
      if (child instanceof Element && child.matches("code, pre")) {
        return "\u0000";
      }
      return htmlTaskText(child);
    })
    .join("");
}

function htmlTask(item: HTMLLIElement) {
  const first = firstItemContent(item);

  if (first instanceof HTMLInputElement && first.type === "checkbox") {
    return { checkbox: first, checked: first.checked, lead: item, prefix: 0 };
  }
  if (!(first instanceof Text)) {
    return null;
  }

  const lead = first.parentElement?.closest("p") ?? item;
  const marker = HTML_TASK_MARKER.exec(htmlTaskText(lead));
  const mark = marker?.groups?.mark;

  return marker === null || mark === undefined
    ? null
    : { checkbox: null, checked: mark !== " ", lead, prefix: marker[0].length };
}

function convertHtmlTask(item: HTMLLIElement, task: HtmlTask) {
  if (task.checkbox === null) {
    const { lead } = task;
    const walker = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    range.setStart(lead, 0);
    let remaining = task.prefix;

    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if (!(node instanceof Text)) {
        continue;
      }
      if (remaining <= node.length) {
        range.setEnd(node, remaining);
        range.deleteContents();
        break;
      }
      remaining -= node.length;
    }
  } else {
    task.checkbox.remove();
  }

  item.dataset.checked = String(task.checked);
  item.dataset.type = "taskItem";
  // Tiptap reads task content from the first div. A nested task can already
  // hold one, so the item's own content needs its wrapper before parsing.
  const content = document.createElement("div");
  content.append(...item.childNodes);
  const first = firstItemContent(content);
  if (
    first === null ||
    (first instanceof Element &&
      first.matches("ul, ol, blockquote, table, pre, hr"))
  ) {
    content.prepend(document.createElement("p"));
  }
  item.replaceChildren(content);
}

function normalizeHtmlTasks(root: HTMLElement) {
  for (const list of [...root.querySelectorAll("ul")].toReversed()) {
    if (
      list.closest("pre, code") !== null ||
      list.dataset.type === "taskList"
    ) {
      continue;
    }

    const items = [...list.children].flatMap((item) =>
      item instanceof HTMLLIElement ? [{ item, task: htmlTask(item) }] : []
    );
    if (
      items.length !== list.children.length ||
      items.every(
        ({ item, task }) => task === null && item.dataset.type !== "taskItem"
      )
    ) {
      continue;
    }

    const runs: HTMLUListElement[] = [];
    for (const { item, task } of items) {
      if (task !== null) {
        convertHtmlTask(item, task);
      }
      const type = item.dataset.type === "taskItem" ? "taskList" : undefined;
      const last = runs.at(-1);
      const run =
        last !== undefined && last.dataset.type === type
          ? last
          : document.createElement("ul");

      if (run !== last) {
        for (const attribute of list.attributes) {
          run.setAttribute(attribute.name, attribute.value);
        }
        if (type === undefined) {
          delete run.dataset.type;
        } else {
          run.dataset.type = type;
        }
        runs.push(run);
      }
      run.append(item);
    }
    list.replaceWith(...runs);
  }
}

function localizeHtmlHeadingLinks(root: HTMLElement, schema: Schema) {
  const anchors = headingAnchors(
    DOMParser.fromSchema(schema).parse(root).content
  );
  const links = [...root.querySelectorAll("a[href]")].flatMap((anchor) => {
    const href = anchor.getAttribute("href");
    const url = href === null ? null : URL.parse(href);

    if (
      href === null ||
      url === null ||
      url.hash === "" ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      return [];
    }
    const fragment = href.slice(href.indexOf("#"));
    try {
      if (!anchors.has(decodeURIComponent(fragment.slice(1)))) {
        return [];
      }
    } catch (error) {
      // Invalid percent encoding cannot identify a pasted heading. Keep the
      // URL intact so its original destination and failure stay observable.
      if (error instanceof URIError) {
        return [];
      }
      throw error;
    }
    url.hash = "";
    return [{ anchor, base: url.href, fragment }];
  });

  if (new Set(links.map((link) => link.base)).size === 1) {
    for (const { anchor, fragment } of links) {
      anchor.setAttribute("href", fragment);
    }
  }
}

function normalizedHtml(html: string, schema: Schema) {
  const root = document.createElement("div");
  root.innerHTML = html;

  // Editor copies already carry their schema shape and slice boundaries.
  // Reading visible marker text again would turn a copied literal into a task.
  if (root.querySelector("[data-pm-slice]") !== null) {
    return html;
  }

  normalizeHtmlTasks(root);
  if (root.querySelector("a[href]") !== null) {
    localizeHtmlHeadingLinks(root, schema);
  }
  return root.innerHTML;
}

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
 * `pasteText` passes the paste handlers no clipboard data, so none of them
 * reads the text as markdown or HTML.
 */
async function pastePlainText(
  editor: Editor,
  readClipboardText: ReadClipboardText,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    const [text] = await Promise.all([readClipboardText(), previous]);

    if (editor.isDestroyed) {
      return;
    }
    if (text === null || text === "") {
      throw new Error("The clipboard holds no text");
    }

    const { state, view } = editor;

    view.dispatch(state.tr.setSelection(paste.selection.resolve(state.doc)));
    view.pasteText(text);
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not paste",
      type: "error",
    });
  } finally {
    pending.delete(paste);
    await previous;
  }
}

/**
 * Paste by the clipboard's source: the editor metadata on the event, the
 * native reader when the webview omits it, and markdown only when neither
 * the HTML nor the source says otherwise. ⌘⌥⇧V pastes the plain text as
 * typed.
 */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  addOptions() {
    return { readClipboardSource: null, readClipboardText: null };
  },
  addProseMirrorPlugins() {
    const pending = new Set<PendingPaste>();
    let previous = Promise.resolve();

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handleKeyDown: keydownHandler({
            "Mod-Alt-Shift-v": (state) => {
              if (this.options.readClipboardText === null) {
                return false;
              }

              const paste = { selection: state.selection.getBookmark() };

              pending.add(paste);
              previous = pastePlainText(
                this.editor,
                this.options.readClipboardText,
                paste,
                pending,
                previous
              );
              return true;
            },
          }),
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
          transformPastedHTML: (html) =>
            normalizedHtml(html, this.editor.schema),
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
