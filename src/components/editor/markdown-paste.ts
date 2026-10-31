import type { Editor, JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { keydownHandler } from "@tiptap/pm/keymap";
import { DOMParser } from "@tiptap/pm/model";
import type { Fragment, Schema } from "@tiptap/pm/model";
import type { EditorState, SelectionBookmark } from "@tiptap/pm/state";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
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

/**
 * A queued paste dispatched again on its turn: a clipboard paste with the
 * formats it was made with, or ⌘⌥⇧V's text, which carries no clipboard data.
 */
type Replay =
  | {
      event: ClipboardEvent;
      kind: "clipboard";
      plain: boolean;
      source: () => ClipboardSource | null;
    }
  | { event: ClipboardEvent; kind: "text"; text: string };

/** Save a pasted image, returning the destination the note embeds. */
export type SaveImage = (image: File) => Promise<string>;

interface MarkdownPasteOptions {
  readClipboardSource: ReadClipboardSource | null;
  readClipboardText: ReadClipboardText | null;
  saveImage: SaveImage | null;
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

  // WebKit hands the HTML over in its interchange form, with a space at a
  // text node's edge as a non-breaking space in a span. ProseMirror restores
  // them after this transform, too late for the marker check.
  for (const span of root.querySelectorAll("span.Apple-converted-space")) {
    if (span.childNodes.length === 1 && span.textContent === "\u00A0") {
      span.replaceWith(" ");
    }
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

/**
 * Whether a paste with something to paste goes through the queue: behind a
 * pending paste, or alone when it waits on the native clipboard read, so it
 * lands through a paste event of its own. Tiptap's paste rules judge a paste
 * by the latest paste event.
 */
function takesTurn(
  clipboardData: DataTransfer,
  state: EditorState,
  pending: Set<PendingPaste>,
  readClipboardSource: ReadClipboardSource | null
) {
  const text = clipboardData.getData("text/plain");

  const waitsOnSource =
    readClipboardSource !== null &&
    text !== "" &&
    state.selection.$from.parent.type.spec.code !== true;

  return (
    (text !== "" ||
      clipboardData.getData("text/html") !== "" ||
      clipboardData.getData("text/uri-list") !== "") &&
    (pending.size > 0 || waitsOnSource)
  );
}

/**
 * Land a queued paste on its turn. ProseMirror's own handler would read Shift
 * as it is then, so a paste made with Shift held goes through `pasteText`, and
 * HTML outside code through `pasteHTML`. False leaves it to ProseMirror.
 */
function landReplay(view: EditorView, event: ClipboardEvent, replay: Replay) {
  if (replay.kind === "text") {
    event.preventDefault();
    view.pasteText(replay.text);

    return true;
  }

  const { clipboardData } = event;

  if (clipboardData === null) {
    throw new Error("A replayed paste has no clipboard data");
  }

  const text = clipboardData.getData("text/plain");
  const html = clipboardData.getData("text/html");

  // Code reads the plain text either way.
  if (replay.plain && text !== "") {
    event.preventDefault();
    view.pasteText(text, event);

    return true;
  }

  if (
    html === "" ||
    view.state.selection.$from.parent.type.spec.code === true
  ) {
    return false;
  }

  event.preventDefault();
  view.pasteHTML(html, event);

  return true;
}

/** The clipboard formats a paste reads, copied before the event ends. */
function clipboardCopy(clipboardData: DataTransfer) {
  const copy = new DataTransfer();

  for (const type of [
    "text/plain",
    "text/html",
    "text/uri-list",
    "vscode-editor-data",
  ]) {
    const value = clipboardData.getData(type);

    if (value !== "") {
      copy.setData(type, value);
    }
  }

  return copy;
}

/** A caret at `pos` that stays after content inserted there. */
function pointAfter(pos: number): SelectionBookmark {
  return {
    map: (mapping) => pointAfter(mapping.map(pos)),
    resolve: (doc) => Selection.near(doc.resolve(pos), -1),
  };
}

/**
 * The selection, until a step replaces its range, then a caret after what
 * replaced it.
 */
function untilReplaced(
  selection: SelectionBookmark,
  to: number
): SelectionBookmark {
  return {
    map: (mapping) => {
      const end = mapping.mapResult(to, -1);

      return end.deletedBefore
        ? pointAfter(mapping.map(to))
        : untilReplaced(selection.map(mapping), end.pos);
    },
    resolve: (doc) => selection.resolve(doc),
  };
}

/**
 * Where a paste made now lands. Over the range a pending paste replaces, it
 * lands after that paste's content, as it would once that paste had landed.
 */
function pasteBookmark(state: EditorState, pending: Set<PendingPaste>) {
  const { from, to } = state.selection;

  const replaced =
    from !== to &&
    [...pending].some(({ selection }) => {
      const range = selection.resolve(state.doc);

      return range.from === from && range.to === to;
    });

  return replaced
    ? untilReplaced(state.selection.getBookmark(), to)
    : state.selection.getBookmark();
}

/** ProseMirror ignores a paste while a composition is in progress. */
async function compositionEnd(editor: Editor) {
  if (editor.isDestroyed || !editor.view.composing) {
    return;
  }

  const ended = Promise.withResolvers<Event>();

  editor.view.dom.addEventListener("compositionend", ended.resolve, {
    once: true,
  });
  await ended.promise;
  await compositionEnd(editor);
}

/**
 * Read the source now, while the clipboard still holds this paste. The
 * result returns that source, or throws the read's failure, on the paste's
 * turn.
 */
async function sourceNow(
  readClipboardSource: ReadClipboardSource,
  text: string,
  metadata: string
) {
  try {
    const source = editorSource(metadata) ?? (await readClipboardSource(text));

    return () => source;
  } catch (error) {
    return () => {
      throw error;
    };
  }
}

/**
 * Wait for the pastes ahead, then paste again at the bookmark, so every
 * handler, the table's included, runs in turn.
 */
async function pasteInTurn(
  editor: Editor,
  replay: (source: () => ClipboardSource | null) => void,
  source: Promise<() => ClipboardSource | null>,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    const [read] = await Promise.all([source, previous]);

    await compositionEnd(editor);

    if (!editor.isDestroyed) {
      const { state, view } = editor;

      view.dispatch(state.tr.setSelection(paste.selection.resolve(state.doc)));
      replay(read);
    }
  } finally {
    pending.delete(paste);
  }
}

async function pasteImage(
  editor: Editor,
  saveImage: SaveImage,
  image: File | null,
  paste: PendingPaste,
  pending: Set<PendingPaste>,
  previous: Promise<void>
) {
  try {
    if (image === null) {
      throw new Error("The clipboard contains no image file");
    }

    const [src] = await Promise.all([saveImage(image), previous]);

    await compositionEnd(editor);

    if (!editor.isDestroyed) {
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setSelection(paste.selection.resolve(tr.doc));

          return true;
        })
        .setImage({ src })
        .run();
    }
  } catch (error) {
    toast.add({
      description: reasonOf(error),
      title: "could not paste image",
      type: "error",
    });
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
  replay: (text: string) => void,
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
    replay(text);
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
 * typed. An image saves through `saveImage` before it goes in. Every paste
 * lands in the order it was made.
 */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  addOptions() {
    return {
      readClipboardSource: null,
      readClipboardText: null,
      saveImage: null,
    };
  },
  addProseMirrorPlugins() {
    const pending = new Set<PendingPaste>();
    let previous = Promise.resolve();
    // Set only while a queued paste dispatches again, since it already holds
    // its turn.
    let replay: Replay | null = null;
    // ProseMirror pastes plain while Shift is held, and a queued paste keeps
    // the Shift it was made with.
    let shiftHeld = false;

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handleDOMEvents: {
            keydown: (_view, event) => {
              // Shift+Insert is a paste key, not a plain paste.
              shiftHeld = event.shiftKey && event.key !== "Insert";

              return false;
            },
            keyup: (_view, event) => {
              if (event.key === "Shift") {
                shiftHeld = false;
              }

              return false;
            },
            // Ahead of every `handlePaste`, so a handler earlier in the
            // chain, such as the table's cell paste, never jumps the queue
            // or takes an image's empty slice.
            paste: (view, event) => {
              const { clipboardData } = event;

              if (event === replay?.event) {
                return landReplay(view, event, replay);
              }

              // ProseMirror leaves a paste during a composition to the
              // browser, which would land it ahead of a pending paste.
              if (
                clipboardData === null ||
                (view.composing && pending.size === 0)
              ) {
                return false;
              }

              const text = clipboardData.getData("text/plain");

              // Word and Numbers copy a picture beside the text; a browser
              // copies an image with none. Text on the clipboard is what was
              // copied.
              const image =
                text === ""
                  ? [...clipboardData.items].find((item) =>
                      item.type.startsWith("image/")
                    )
                  : undefined;

              if (this.options.saveImage !== null && image !== undefined) {
                event.preventDefault();

                // An image inserted into code splits the block and turns the
                // code after it into prose.
                if (view.state.selection.$from.parent.type.spec.code === true) {
                  toast.add({
                    description: "An image cannot go inside code",
                    title: "could not paste image",
                    type: "error",
                  });

                  return true;
                }

                const paste = { selection: pasteBookmark(view.state, pending) };

                pending.add(paste);
                previous = pasteImage(
                  this.editor,
                  this.options.saveImage,
                  image.getAsFile(),
                  paste,
                  pending,
                  previous
                );

                return true;
              }

              if (
                !takesTurn(
                  clipboardData,
                  view.state,
                  pending,
                  this.options.readClipboardSource
                )
              ) {
                return false;
              }

              event.preventDefault();

              const data = clipboardCopy(clipboardData);
              const plain = shiftHeld;
              const metadata = clipboardData.getData("vscode-editor-data");
              const paste = { selection: pasteBookmark(view.state, pending) };

              pending.add(paste);
              previous = pasteInTurn(
                this.editor,
                (source) => {
                  const again = new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: data,
                  });

                  replay = { event: again, kind: "clipboard", plain, source };

                  try {
                    view.dom.dispatchEvent(again);
                  } finally {
                    replay = null;
                  }
                },
                this.options.readClipboardSource === null || text === ""
                  ? Promise.resolve(() => editorSource(metadata))
                  : sourceNow(this.options.readClipboardSource, text, metadata),
                paste,
                pending,
                previous
              );

              return true;
            },
          },
          handleKeyDown: keydownHandler({
            "Mod-Alt-Shift-v": (state) => {
              if (this.options.readClipboardText === null) {
                return false;
              }

              const paste = { selection: pasteBookmark(state, pending) };

              pending.add(paste);
              previous = pastePlainText(
                this.editor,
                this.options.readClipboardText,
                (text) => {
                  const again = new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                  });

                  replay = { event: again, kind: "text", text };

                  try {
                    this.editor.view.dom.dispatchEvent(again);
                  } finally {
                    replay = null;
                  }
                },
                paste,
                pending,
                previous
              );

              return true;
            },
          }),
          handlePaste: (view, event, slice) => {
            // `pasteText` from ⌘⌥⇧V sends no clipboard data, and that paste
            // already holds its place in the queue.
            if (event.clipboardData === null) {
              return false;
            }

            const text = event.clipboardData.getData("text/plain");

            if (
              view.state.selection.$from.parent.type.spec.code === true ||
              containsCodeBlock(slice.content) ||
              text === ""
            ) {
              return false;
            }

            const html = event.clipboardData.getData("text/html");

            // Rich sources such as browsers, Slack and Docs put their own
            // flattening of the HTML in plain text, and a line in it that
            // looks like markdown is no sign the HTML is.
            const markdown = html === "" && MARKDOWN_PASTE_PATTERN.test(text);
            const metadata = event.clipboardData.getData("vscode-editor-data");

            const replayed =
              event === replay?.event && replay.kind === "clipboard"
                ? replay
                : null;

            try {
              const content = contentBySource(
                this.editor,
                replayed === null ? editorSource(metadata) : replayed.source(),
                text,
                markdown
              );

              return (
                content !== null &&
                this.editor
                  .chain()
                  .command(({ tr }) => {
                    tr.setMeta("paste", true).setMeta("uiEvent", "paste");

                    return true;
                  })
                  .insertContent(content)
                  .run()
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
