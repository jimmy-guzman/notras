import { useDebouncer } from "@tanstack/react-pacer";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Extension, getMarkRange } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { hasString } from "@/components/editor/attrs";
import { revealSyntax } from "@/components/editor/code-block-shiki";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import { isNotePath, isRelativeDestination } from "@/core/links";
import { attachImage } from "@/data/attach-file";
import { styleNonce } from "@/lib/style-nonce";
import { readCodeClipboard } from "@/lib/ui/code-clipboard";
import { reasonOf } from "@/lib/ui/failure";
import { attachmentDestination } from "@/lib/utils/attachments";

import {
  converterOf,
  createEditorExtensions,
  fileMarkdown,
  serializeMarkdown,
} from "./extensions";
import { createFindHandle, Find } from "./find";
import type { FindHandle } from "./find";
import type { LinkEditorState } from "./link-editor";
import { LinkEditor } from "./link-editor";
import type { LinkHoverState } from "./link-hover";
import { LinkHover } from "./link-hover";
import type { DocumentEdit, SelectionReader } from "./note-document";
import { findSentinel, SENTINEL } from "./sentinel";
import {
  createTypewriter,
  engageTypewriterPadding,
  TYPEWRITER_SCROLL,
} from "./typewriter";
import { isSafeUrl, normalizeUrl } from "./urls";

/** Long enough to cross the gap between a link and its panel. */
const HOVER_CLOSE_MS = 150;
const HOVER_OPEN_MS = 300;

const UNSAFE_LINK_MESSAGE = "that link uses a scheme notras will not open";

/**
 * The title of the wikilink the caret sits in or beside, or "" where none is.
 * The node after the caret is only the answer when it is the pill: with text
 * following one, `nodeAt(head)` is that text and the pill is behind the caret.
 */
function wikilinkTitleAt(state: EditorState, head: number) {
  const after = state.doc.nodeAt(head);
  const before = head > 0 ? state.doc.nodeAt(head - 1) : null;
  const node = after?.type.name === "wikilink" ? after : before;

  return node?.type.name === "wikilink" ? String(node.attrs.title ?? "") : "";
}

/**
 * The words a link edit starts from: the link the caret is in, or whatever is
 * selected when there is no link yet.
 */
function wordsAt(state: EditorState) {
  const { from, to } = state.selection;
  const type = state.schema.marks.link;
  const range = type && getMarkRange(state.selection.$head, type);

  return range
    ? state.doc.textBetween(range.from, range.to)
    : state.doc.textBetween(from, to);
}

/** `readAsDataURL` settles with a string; the type also covers the other readers. */
function isDataUrl(result: FileReader["result"]): result is string {
  return typeof result === "string";
}

/**
 * What the panel says about the thing under the pointer. A markdown link
 * carries its destination; a wikilink resolves by title, so its own text says
 * nothing useful and the note it lands on does.
 */
function hoverStateFor(
  target: HTMLElement,
  markHref: string,
  resolveWikilink?: (title: string) => string | undefined
) {
  // An anchor is a link whatever its href says. `renderHTML` blanks the one it
  // renders for a scheme the app will not open, and the mark still carries the
  // real destination, which is the one worth showing.
  if (target.hasAttribute("href")) {
    return {
      editable: true,
      missing: false,
      title: null,
      url: markHref || (target.getAttribute("href") ?? ""),
    };
  }

  const title = target.dataset.wikilink ?? target.textContent;

  if (resolveWikilink === undefined || title === null || title === "") {
    return null;
  }

  const path = resolveWikilink(title);

  return path === undefined
    ? { editable: true, missing: true, title, url: `no note named "${title}"` }
    : { editable: true, missing: false, title, url: path };
}

/** The href of the link mark at `pos`, or "" where there is no link. */
function hrefAt(state: EditorState, pos: number) {
  const link = state.doc
    .resolve(pos)
    .marks()
    .find((mark) => mark.type.name === "link");

  const attrs = link?.attrs;

  return hasString(attrs, "href") ? attrs.href : "";
}

/**
 * Hrefs arrive from the file on disk (parse, paste, input rule), never only
 * from the link editor, so the scheme is gated here too.
 */
function followLink(
  href: string,
  onNoteLinkClick?: (href: string) => void,
  onFileLinkClick?: (href: string) => void
) {
  if (isNotePath(href) && onNoteLinkClick) {
    onNoteLinkClick(href);

    return;
  }

  if (isRelativeDestination(href)) {
    onFileLinkClick?.(href);

    return;
  }

  if (!isSafeUrl(href)) {
    toast.add({ title: UNSAFE_LINK_MESSAGE, type: "error" });

    return;
  }

  // oxlint-disable-next-line promise/prefer-await-to-then, promise/prefer-await-to-callbacks, anti-slop/no-unknown-parameters -- ProseMirror's click handler is synchronous, so the failure toast rides the rejection, whose value is unknown by the language
  openUrl(href).catch((error: unknown) => {
    toast.add({
      description: reasonOf(error),
      title: "could not open link",
      type: "error",
    });
  });
}

function firstTitle(doc: ProseMirrorNode) {
  let result: { from: number; to: number } | undefined;
  doc.descendants((node, position) => {
    if (
      result !== undefined ||
      node.type.name === "codeBlock" ||
      node.type.name === "table"
    ) {
      return false;
    }
    if (node.type.name !== "paragraph" && node.type.name !== "heading") {
      return true;
    }
    let from = position + 1;
    let text = "";
    // oxlint-disable-next-line unicorn/no-array-for-each -- a ProseMirror node, not an array
    node.forEach((child, offset) => {
      if (result !== undefined) {
        return;
      }
      if (child.type.name === "hardBreak") {
        if (text.trim() !== "") {
          result = { from, to: position + 1 + offset };
        }
        from = position + 1 + offset + child.nodeSize;
        text = "";
      } else if (child.type.name === "wikilink") {
        text += String(child.attrs.title);
      } else if (child.isText) {
        text += child.textContent;
      }
    });
    if (result === undefined && text.trim() !== "") {
      result = { from, to: position + 1 + node.content.size };
    }
    return false;
  });
  return result;
}

function touchesTitle(transaction: Transaction) {
  const old = firstTitle(transaction.before);
  const next = firstTitle(transaction.doc);
  if (
    (old === undefined) !== (next === undefined) ||
    (old !== undefined &&
      next !== undefined &&
      !transaction.before
        .slice(old.from, old.to)
        .eq(transaction.doc.slice(next.from, next.to)))
  ) {
    return true;
  }
  return transaction.steps.some((step, index) => {
    const before = transaction.docs[index];
    const range = before === undefined ? undefined : firstTitle(before);
    if (range === undefined) {
      return false;
    }
    // Formatting steps have empty maps but still touch the title.
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      return step.from < range.to && step.to > range.from;
    }
    let touched = false;
    // oxlint-disable-next-line unicorn/no-array-for-each -- a ProseMirror step map, not an array
    step.getMap().forEach((from, to) => {
      touched ||= from < range.to && to > range.from;
    });
    return touched;
  });
}

function selectionSpansBlocks({ doc, selection }: EditorState) {
  if (selection.empty) {
    return false;
  }

  // `to` sits after the last block when a whole node is selected, so the last
  // position inside the range is what names that block.
  return (
    doc.resolve(selection.from).index(0) !==
    doc.resolve(selection.to - 1).index(0)
  );
}

function sourceOffset(
  editor: TiptapEditor,
  position: number,
  state = editor.state
) {
  try {
    return fileMarkdown(
      converterOf(editor),
      state.tr.insertText(SENTINEL, position).doc
    ).indexOf(SENTINEL);
  } catch {
    return -1;
  }
}

function sourceSelectionReader(
  editor: TiptapEditor,
  state: EditorState
): SelectionReader {
  return () => {
    const { selection } = state;
    const anchor = sourceOffset(editor, selection.anchor, state);
    const head = selection.empty
      ? anchor
      : sourceOffset(editor, selection.head, state);

    return anchor >= 0 && head >= 0 ? { anchor, head } : undefined;
  };
}

function positionInDocument(
  editor: TiptapEditor,
  content: string,
  offset: number
) {
  const manager = converterOf(editor);
  const at = Math.max(0, Math.min(offset, content.length));
  const marked = editor.schema.nodeFromJSON(
    manager.parse(content.slice(0, at) + SENTINEL + content.slice(at))
  );
  const clean = editor.schema.nodeFromJSON(manager.parse(content));
  return Math.min(findSentinel(marked) ?? 1, clean.content.size);
}

export interface EditorHandle {
  find: FindHandle;
  /** Takes the caret without moving the viewport. */
  focus: () => void;
  /**
   * The caret's exact offset in this buffer's markdown serialization,
   * found by serializing a throwaway clone with a sentinel at the caret.
   * -1 when it cannot be determined.
   */
  getCaretSourceOffset: () => number;
  getContent: () => string;
  insertText: (text: string) => void;
  replaceContent: (
    content: string,
    selection?: { anchor: number; head: number }
  ) => void;
  /** Colors every code block for a print; the returned function windows them again. */
  revealSyntax: () => () => void;
  /** The rendered note, read for a copy and never written. */
  surface: () => HTMLElement;
}

interface EditorProps {
  /**
   * Where a pasted image's destination is written from: the note's library
   * path, null for a file that takes no attachments, absent for the notes root.
   */
  documentPath?: () => null | string;
  findOpen?: boolean;
  focusModeEnabled?: boolean;
  focusOnMount?: boolean;
  /** Initial markdown BODY -- the editor owns the buffer after mount. */
  initialContent: string;
  onBlur?: () => void;
  onChange: (content: string, edit: DocumentEdit) => void;
  /** Open a file the note links to, relative to the note. */
  onFileLinkClick?: (href: string) => void;
  onHistory?: (direction: "undo" | "redo", execute: boolean) => boolean;
  /** Navigate when a markdown link to a note is clicked. */
  onNoteLinkClick?: (href: string) => void;
  onReady?: (handle: EditorHandle) => void;
  /** Undefined once the editor is destroyed. */
  onSelect?: (read: SelectionReader | undefined) => void;
  /** Navigate when a wikilink pill is clicked. */
  onWikilinkClick?: (title: string) => void;
  placeholderText?: string;
  /** Resolve image sources (e.g. `attachments/x.png`) to loadable URLs. */
  resolveImageSrc?: (src: string) => string;
  /** The note a wikilink title lands on, or undefined when it names none. */
  resolveWikilink?: (title: string) => string | undefined;
  /**
   * The initial content carries a SENTINEL at the caret spot (source-mode
   * exit): strip it after mount and place the caret exactly there.
   */
  stripSentinel?: boolean;
  /** Stable getter for live note titles (wikilink completion). */
  titles?: () => string[];
}

/**
 * Rich Markdown view of a note body. Mount props are frozen; live callbacks
 * read through refs. The session applies document changes through the handle
 * and owns history when `onHistory` is supplied. Frontmatter stays in the session.
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- the split is tracked in #203
export function Editor({
  findOpen = false,
  focusModeEnabled = false,
  ...mountProps
}: EditorProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [typewriter] = useState(createTypewriter);
  const attachScrollArea = (root: HTMLDivElement | null) => {
    scrollAreaRef.current = root;
    scrollerRef.current =
      root?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null;
    typewriter.setScroller(scrollerRef.current);
  };
  const editorRef = useRef<null | TiptapEditor>(null);
  const suppressChangeRef = useRef(false);
  const previousFocusModeRef = useRef(focusModeEnabled);

  useEffect(() => {
    typewriter.setEnabled(focusModeEnabled && !findOpen);
  }, [findOpen, focusModeEnabled, typewriter]);

  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [config] = useState(() => mountProps);
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [linkHover, setLinkHover] = useState<LinkHoverState | null>(null);
  const closeHover = useDebouncer(
    () => {
      setLinkHover(null);
    },
    { wait: HOVER_CLOSE_MS }
  );
  const openHover = useDebouncer(
    (target: HTMLElement) => {
      const instance = editorRef.current;

      if (
        instance === null ||
        instance.isDestroyed ||
        linkEditor !== null ||
        !target.isConnected ||
        target.closest("[hidden], [inert]") !== null ||
        !instance.view.dom.contains(target)
      ) {
        return;
      }

      const pos = instance.view.posAtDOM(target, 0);
      const state = hoverStateFor(
        target,
        hrefAt(instance.state, pos + 1),
        config.resolveWikilink
      );

      if (state === null) {
        return;
      }

      const rect = target.getBoundingClientRect();

      setLinkHover({
        ...state,
        left: rect.left,
        pos,
        top: rect.bottom + 6,
      });
    },
    { wait: HOVER_OPEN_MS }
  );
  const dismissHover = () => {
    openHover.cancel();
    closeHover.cancel();
    setLinkHover(null);
  };
  const [reading, setReading] = useState(false);
  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [linkShortcut] = useState(() =>
    // ⌘K belongs to the palette, so the link keys sit under ⌘⇧: K makes one, O
    // follows the one at the caret, which is the only way there without a mouse.
    Extension.create({
      addKeyboardShortcuts: () => ({
        "Mod-Shift-k": ({ editor: instance }) => {
          dismissHover();
          const { head } = instance.state.selection;
          const attrs = instance.getAttributes("link");
          const url = hasString(attrs, "href") ? attrs.href : "";
          const coords = instance.view.coordsAtPos(head);

          setLinkEditor((previous) => ({
            id: (previous?.id ?? 0) + 1,
            kind: "link",
            left: coords.left,
            text: wordsAt(instance.state),
            top: coords.bottom + 6,
            url,
          }));

          return true;
        },
        "Mod-Shift-o": ({ editor: instance }) => {
          dismissHover();
          const { head } = instance.state.selection;
          const attrs = instance.getAttributes("link");
          const href = hasString(attrs, "href") ? attrs.href : "";

          if (href !== "") {
            followLink(href, config.onNoteLinkClick, config.onFileLinkClick);

            return true;
          }

          const title = wikilinkTitleAt(instance.state, head);

          if (title !== "" && config.onWikilinkClick) {
            config.onWikilinkClick(title);

            return true;
          }

          return false;
        },
      }),
      name: "linkShortcut",
    })
  );
  const editor = useEditor({
    content: config.initialContent,
    contentType: "markdown",
    editorProps: {
      attributes: {
        autocapitalize: "off",
        autocorrect: "off",
        class:
          "typeset typeset-note mx-auto w-full max-w-2xl px-6 py-6 focus:outline-none",
        spellcheck: "true",
      },
      // Copying out of the editor puts markdown on the clipboard.
      clipboardTextSerializer: (slice, view) => {
        const fallback = slice.content.textBetween(
          0,
          slice.content.size,
          "\n\n"
        );

        try {
          const doc = view.state.schema.topNodeType.create(null, slice.content);
          const manager = editorRef.current?.markdown;

          return manager ? fileMarkdown(manager, doc) : fallback;
        } catch {
          return fallback;
        }
      },
      handleClickOn: (view, _pos, node, _nodePos, event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("a[href], [data-wikilink]")
            : null;

        // A resolved text position can belong to a link even when the pointer
        // lands in the space beside it.
        if (target === null) {
          return false;
        }

        // Unsafe destinations render with an empty href. Read inside this
        // anchor so the scheme gate can still explain why it will not open.
        const href = target.hasAttribute("href")
          ? hrefAt(view.state, view.posAtDOM(target, 0) + 1)
          : "";

        if (href !== "") {
          followLink(href, config.onNoteLinkClick, config.onFileLinkClick);

          return true;
        }

        if (
          Object.hasOwn(target.dataset, "wikilink") &&
          node.type.name === "wikilink" &&
          config.onWikilinkClick
        ) {
          config.onWikilinkClick(String(node.attrs.title ?? ""));

          return true;
        }

        return false;
      },
      handleDOMEvents: {
        // ProseMirror handles mouseup; cancel the later click to keep navigation
        // behind the scheme gate.
        click: (_view, event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a[href]") !== null
          ) {
            event.preventDefault();
          }

          return false;
        },
        mousedown: () => {
          dismissHover();

          return false;
        },
        mouseout: (_view, event) => {
          const target =
            event.target instanceof Element
              ? event.target.closest("a[href], [data-wikilink]")
              : null;

          if (
            target === null ||
            (event.relatedTarget instanceof Node &&
              target.contains(event.relatedTarget))
          ) {
            return false;
          }

          openHover.cancel();
          closeHover.maybeExecute();

          return false;
        },
        mouseover: (view, event) => {
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("a[href], [data-wikilink]")
              : null;

          if (
            target === null ||
            event.buttons !== 0 ||
            (event.relatedTarget instanceof Node &&
              target.contains(event.relatedTarget))
          ) {
            return false;
          }

          closeHover.cancel();
          setLinkHover((previous) =>
            previous?.pos === view.posAtDOM(target, 0) ? previous : null
          );
          openHover.maybeExecute(target);

          return false;
        },
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;

        if (!clipboard) {
          return false;
        }

        // Images: save into attachments/, keep the RELATIVE src in the doc
        // so the file stays portable.
        const imageItem = [...clipboard.items].find((item) =>
          item.type.startsWith("image/")
        );

        if (imageItem) {
          const from =
            config.documentPath === undefined ? "" : config.documentPath();

          if (from === null) {
            toast.add({
              description: "Attachments live in the notes folder",
              title: "could not paste image",
              type: "error",
            });

            return true;
          }

          const blob = imageItem.getAsFile();

          if (blob) {
            const reader = new FileReader();

            reader.addEventListener("error", () => {
              toast.add({
                title: "could not read the pasted image",
                type: "error",
              });
            });
            const attachRead = async () => {
              const result = isDataUrl(reader.result) ? reader.result : "";
              const base64 = result.split(",")[1] ?? "";

              if (base64 === "") {
                toast.add({
                  title: "could not read the pasted image",
                  type: "error",
                });

                return;
              }

              try {
                const relativePath = await attachImage(base64);

                editorRef.current
                  ?.chain()
                  .focus()
                  .setImage({
                    src: attachmentDestination(relativePath, from),
                  })
                  .run();
              } catch (error) {
                toast.add({
                  description: reasonOf(error),
                  title: "could not paste image",
                  type: "error",
                });
              }
            };

            reader.addEventListener("load", () => {
              void attachRead();
            });
            reader.readAsDataURL(blob);

            return true;
          }
        }

        return false;
      },
    },
    extensions: [
      ...createEditorExtensions({
        getTitles: config.titles,
        onHistory: config.onHistory,
        placeholderText: config.placeholderText,
        readCodeClipboard: isTauri() ? readCodeClipboard : undefined,
        resolveImageSrc: config.resolveImageSrc,
      }),
      Find,
      linkShortcut,
      typewriter.extension,
    ],
    immediatelyRender: false,
    injectNonce: styleNonce,
    onBlur: () => {
      config.onBlur?.();
    },
    onCreate: ({ editor: instance }) => {
      editorRef.current = instance;
      config.onReady?.({
        find: createFindHandle(instance),
        focus: () => {
          if (!instance.isDestroyed) {
            const scroller = scrollerRef.current;
            const top = scroller?.scrollTop;

            instance.view.focus();

            // WebKit reveals the selection when the editable it focuses already
            // holds it, and the focus event has put it there by then, so
            // `preventScroll` is ignored and the offset has to be put back.
            if (scroller !== null && top !== undefined) {
              scroller.scrollTop = top;
            }
          }
        },
        getCaretSourceOffset: () =>
          instance.isDestroyed
            ? -1
            : sourceOffset(instance, instance.state.selection.head),
        getContent: () => serializeMarkdown(instance),
        insertText: (text) => {
          if (instance.isDestroyed) {
            return;
          }

          instance.commands.insertContent(text, { contentType: "markdown" });
          instance.commands.focus();
        },
        replaceContent: (content, selection) => {
          if (instance.isDestroyed || instance.markdown === undefined) {
            return;
          }
          const replacement = instance.schema.nodeFromJSON(
            instance.markdown.parse(content)
          );
          const transaction = instance.state.tr;
          const start = transaction.doc.content.findDiffStart(
            replacement.content
          );
          const end = transaction.doc.content.findDiffEnd(replacement.content);
          if (start !== null && end !== null) {
            const overlap = Math.max(0, start - Math.min(end.a, end.b));
            transaction.replace(
              start,
              end.a + overlap,
              replacement.slice(start, end.b + overlap)
            );
          }
          if (selection !== undefined) {
            try {
              transaction.setSelection(
                TextSelection.between(
                  transaction.doc.resolve(
                    positionInDocument(instance, content, selection.anchor)
                  ),
                  transaction.doc.resolve(
                    positionInDocument(instance, content, selection.head)
                  )
                )
              );
            } catch {
              // Selection mapping is optional; the replacement must still reach the view.
            }
          }
          suppressChangeRef.current = true;
          try {
            instance.view.dispatch(transaction.setMeta("addToHistory", false));
          } catch (error) {
            suppressChangeRef.current = false;
            throw error;
          }
          suppressChangeRef.current = false;
        },
        revealSyntax: () => revealSyntax(instance.view),
        surface: () => instance.view.dom,
      });
    },
    onDestroy: () => {
      dismissHover();
      config.onSelect?.(undefined);
    },
    onSelectionUpdate: ({ editor: instance }) => {
      setReading(selectionSpansBlocks(instance.state));
    },
    onTransaction: ({
      editor: instance,
      transaction,
      appendedTransactions,
    }) => {
      if (suppressChangeRef.current) {
        return;
      }
      const transactions = [transaction, ...appendedTransactions];
      if (
        transaction.getMeta("preventUpdate") !== true &&
        transactions.some((entry) => entry.docChanged)
      ) {
        config.onChange(serializeMarkdown(instance), {
          titleEdited: transactions.some(touchesTitle),
        });
      }
      // After the edit reaches the document, which reads the previous reader
      // as the caret before it.
      config.onSelect?.(sourceSelectionReader(instance, instance.state));
    },
  });

  // Caret placement must run AFTER EditorContent attaches the view to the
  // DOM -- focus/scroll are no-ops before that, and TipTap's own autofocus
  // would race us, so this effect owns all mount-time caret behavior.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) {
      return;
    }

    const pos =
      config.stripSentinel === true ? findSentinel(editor.state.doc) : null;

    if (pos !== null) {
      // Remove the sentinel outside history and without notifying autosave;
      // the buffer must end up byte-identical to the file.
      suppressChangeRef.current = true;
      editor.view.dispatch(
        editor.state.tr.delete(pos, pos + 1).setMeta("addToHistory", false)
      );

      // Corruption guard: if the sentinel split a syntax token, the parse
      // diverged and stripping the char does not restore it -- serializing
      // would then write escaped syntax into the file. Compare canonical
      // forms and reparse the clean body when they differ.
      const cleanBody = config.initialContent.replaceAll(SENTINEL, "");
      const diverged = (() => {
        try {
          const manager = converterOf(editor);
          const canonical = fileMarkdown(
            manager,
            editor.schema.nodeFromJSON(manager.parse(cleanBody))
          );

          // Trailing whitespace differs benignly (StarterKit's
          // trailing-node appends an empty paragraph after list-ending
          // docs).
          return serializeMarkdown(editor).trimEnd() !== canonical.trimEnd();
        } catch {
          // Comparison itself failing is not evidence of corruption.
          return false;
        }
      })();

      if (diverged) {
        editor.commands.setContent(cleanBody, {
          contentType: "markdown",
          emitUpdate: false,
        });
      }

      suppressChangeRef.current = false;
    }

    const { doc } = editor.state;
    const selection =
      pos === null
        ? Selection.atStart(doc)
        : TextSelection.create(doc, Math.min(pos, doc.content.size));
    const chain = editor.chain();

    // A tab mounted in the background places its caret without taking
    // focus: several editors mount at launch and only one is showing.
    if (config.focusOnMount === true) {
      chain.focus();
    }

    chain
      .command(({ tr }) => {
        tr.setSelection(selection);

        return true;
      })
      .setMeta(TYPEWRITER_SCROLL, "skip")
      .scrollIntoView()
      .run();
  }, [config, editor]);

  // The recenter rides the plugin's own meta so one animator owns every
  // scroll, and it is gated on a real off-to-on flip so a mount with the
  // pref already on pads without gliding.
  useEffect(() => {
    const wasEnabled = previousFocusModeRef.current;

    previousFocusModeRef.current = focusModeEnabled;

    const scroller = scrollerRef.current;
    const content = editor?.view.dom.parentElement;

    const engage = (
      instance: TiptapEditor,
      area: HTMLElement,
      body: HTMLElement
    ) => {
      const recenter = () => {
        if (instance.isDestroyed) {
          return;
        }

        instance
          .chain()
          .setMeta(TYPEWRITER_SCROLL, "center")
          .scrollIntoView()
          .run();
      };
      const disengage = engageTypewriterPadding(area, body, recenter);

      if (!wasEnabled) {
        recenter();
      }

      return disengage;
    };

    return !focusModeEnabled ||
      editor === null ||
      scroller === null ||
      !(content instanceof HTMLElement)
      ? undefined
      : engage(editor, scroller, content);
  }, [editor, focusModeEnabled]);

  // Wheel and touchmove, never scroll: scroll also fires for the typewriter
  // glide and ProseMirror's own scrollIntoView, which move the scroller on
  // every keystroke (`D64`).
  useEffect(() => {
    const surface = scrollAreaRef.current;
    const watched = focusModeEnabled && surface !== null;
    const engage = () => {
      setReading(true);
    };

    // The other half of `onSelectionUpdate`: ProseMirror drops a pointer
    // selection equal to the current one before it ever becomes a transaction,
    // so a click on the caret already there reaches no callback. It defers to
    // the selection because a drag across blocks can end in a click too.
    const restore = () => {
      const instance = editorRef.current;

      setReading(instance !== null && selectionSpansBlocks(instance.state));
    };

    if (watched) {
      surface.addEventListener("wheel", engage, { passive: true });
      surface.addEventListener("touchmove", engage, { passive: true });
      surface.addEventListener("click", restore);
    }

    return () => {
      if (!watched) {
        return;
      }
      surface.removeEventListener("wheel", engage);
      surface.removeEventListener("touchmove", engage);
      surface.removeEventListener("click", restore);
      setReading(false);
    };
  }, [focusModeEnabled]);

  const cancelLink = () => {
    setLinkEditor(null);
    editor?.commands.focus();
  };

  const removeLink = () => {
    setLinkEditor(null);
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  // The panel opens the editor where it already sits, so the two are one
  // surface rather than two places a link is changed from.
  const editHoveredLink = () => {
    if (editor === null || linkHover === null) {
      return;
    }

    // Put the caret in the hovered link first, so the editor's own commands
    // act on it rather than on wherever the caret happened to be.
    const { pos, title } = linkHover;

    if (title === null) {
      editor.commands.setTextSelection(pos);
    } else {
      editor.commands.setNodeSelection(pos);
    }

    dismissHover();
    setLinkEditor((previous) => ({
      id: (previous?.id ?? 0) + 1,
      kind: title === null ? "link" : "wikilink",
      left: linkHover.left,
      text: title ?? wordsAt(editor.state),
      top: linkHover.top,
      url: title === null ? linkHover.url : "",
    }));
  };

  const submitLink = (rawUrl: string, text?: string) => {
    if (editor === null) {
      return;
    }

    // A wikilink has no url: its title is both what it says and where it
    // goes, so submitting one renames the target.
    if (linkEditor?.kind === "wikilink") {
      setLinkEditor(null);

      if (text !== undefined && text.trim() !== "") {
        editor
          .chain()
          .focus()
          .updateAttributes("wikilink", { title: text.trim() })
          .run();
      } else {
        editor.commands.focus();
      }

      return;
    }

    const href = normalizeUrl(rawUrl);

    setLinkEditor(null);
    if (href === null) {
      if (rawUrl.trim() !== "") {
        toast.add({ title: UNSAFE_LINK_MESSAGE, type: "error" });
      }

      editor.commands.focus();

      return;
    }

    if (text === undefined || text.trim() === "") {
      editor.commands.focus();
    } else {
      editor
        .chain()
        .focus()
        // Covers the whole link so the words are replaced rather than added
        // to; on a selection with no link yet it changes nothing.
        .extendMarkRange("link")
        .insertContent({
          marks: [{ attrs: { href }, type: "link" }],
          text: text.trim(),
          type: "text",
        })
        .run();
    }
  };

  return (
    <ScrollArea
      className="min-h-0 flex-1 select-text"
      data-find-open={findOpen}
      data-focus-mode={focusModeEnabled}
      data-reading={reading}
      ref={attachScrollArea}
    >
      <EditorContent className="min-h-full" editor={editor} />
      {linkHover === null || linkEditor !== null ? null : (
        <LinkHover
          onEdit={editHoveredLink}
          onPointerLeave={() => {
            closeHover.maybeExecute();
          }}
          onPointerOver={() => {
            closeHover.cancel();
          }}
          state={linkHover}
        />
      )}
      {linkEditor === null || editor === null ? null : (
        <LinkEditor
          key={linkEditor.id}
          onCancel={cancelLink}
          onRemove={removeLink}
          onSubmit={submitLink}
          state={linkEditor}
        />
      )}
    </ScrollArea>
  );
}
