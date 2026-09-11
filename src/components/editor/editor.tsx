import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Extension, getMarkRange } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";
import { EditorContent, useEditor } from "@tiptap/react";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toast";
import { isNotePath } from "@/core/links";
import { attachImage } from "@/data/attach-file";
import { styleNonce } from "@/lib/style-nonce";
import { readCodeClipboard } from "@/lib/ui/code-clipboard";
import { reasonOf } from "@/lib/ui/failure";
import { encodeAttachmentPath } from "@/lib/utils/attachments";
import {
  createEditorExtensions,
  fileMarkdown,
  normalizeMarkdown,
  serializeMarkdown,
} from "./extensions";
import { createFindHandle, Find, type FindHandle } from "./find";
import type { LinkEditorState } from "./link-editor";
import { LinkEditor } from "./link-editor";
import type { LinkHoverState } from "./link-hover";
import { LinkHover } from "./link-hover";
import type { DocumentEdit } from "./note-document";
import { findSentinel, SENTINEL } from "./sentinel";
import {
  createTypewriter,
  engageTypewriterPadding,
  TYPEWRITER_SCROLL,
} from "./typewriter";
import { isSafeUrl, normalizeUrl } from "./urls";

const ATTACHMENTS_PREFIX = "attachments/";

/** Long enough to cross the gap between a link and its panel. */
const HOVER_CLOSE_MS = 150;

const UNSAFE_LINK_MESSAGE = "that link uses a scheme notras will not open";

/**
 * The title of the wikilink the caret sits in or beside, or "" where none is.
 * The node after the caret is only the answer when it is the pill: with text
 * following one, `nodeAt(head)` is that text and the pill is behind the caret.
 */
function wikilinkTitleAt(state: EditorState, head: number) {
  const after = state.doc.nodeAt(head);
  const node =
    after?.type.name === "wikilink"
      ? after
      : (head > 0 && state.doc.nodeAt(head - 1)) || null;

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

/**
 * What the panel says about the thing under the pointer. A markdown link
 * carries its destination; a wikilink resolves by title, so its own text says
 * nothing useful and the note it lands on does.
 */
function hoverStateFor(
  target: Element,
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

  const title = target.getAttribute("data-wikilink") ?? target.textContent;

  if (resolveWikilink === undefined || title === null || title === "") {
    return null;
  }

  const path = resolveWikilink(title);

  return path === undefined
    ? { editable: true, missing: true, title, url: `no note named "${title}"` }
    : { editable: true, missing: false, title, url: path };
}

/**
 * The href of the link mark at `pos`, or "" where there is no link. A click
 * asks about the position it landed on, which `editor.getAttributes` cannot
 * answer, since that reads the selection.
 */
function hrefAt(state: EditorState, pos: number) {
  const link = state.doc
    .resolve(pos)
    .marks()
    .find((mark) => mark.type.name === "link");

  return typeof link?.attrs.href === "string" ? link.attrs.href : "";
}

/**
 * Hrefs arrive from the file on disk (parse, paste, input rule), never only
 * from the link editor, so the scheme is gated here too.
 */
function followLink(href: string, onNoteLinkClick?: (href: string) => void) {
  // An attachment is a file the note carries, not a place to go, and a relative
  // path is not something the opener can resolve anyway.
  if (href.startsWith(ATTACHMENTS_PREFIX)) {
    return;
  }

  if (isNotePath(href) && onNoteLinkClick) {
    onNoteLinkClick(href);

    return;
  }

  if (!isSafeUrl(href)) {
    toast.add({ title: UNSAFE_LINK_MESSAGE, type: "error" });

    return;
  }

  openUrl(href).catch((error: unknown) => {
    toast.add({
      description: reasonOf(error),
      title: "could not open link",
      type: "error",
    });
  });
}

function firstHeading(doc: ProseMirrorNode) {
  let result: { from: number; to: number; node: ProseMirrorNode } | undefined;
  let found = false;
  doc.forEach((node, offset) => {
    if (
      found ||
      (node.type.name === "paragraph" && node.textContent.trim() === "")
    ) {
      return;
    }
    found = true;
    if (node.type.name === "heading" && node.attrs.level === 1) {
      result = {
        from: offset,
        node,
        to: offset + node.nodeSize,
      };
    }
  });
  return result;
}

function touchesHeading(transaction: Transaction) {
  const old = firstHeading(transaction.before);
  const next = firstHeading(transaction.doc);
  if (
    (old === undefined) !== (next === undefined) ||
    (old !== undefined && next !== undefined && !old.node.eq(next.node))
  ) {
    return true;
  }
  return transaction.steps.some((step, index) => {
    const before = transaction.docs[index];
    const range = before === undefined ? undefined : firstHeading(before);
    if (range === undefined) {
      return false;
    }
    // Mark steps have empty position maps even though they edit the heading.
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      return step.from < range.to && step.to > range.from;
    }
    let touched = false;
    step.getMap().forEach((from, to) => {
      touched ||= from < range.to && to > range.from;
    });
    return touched;
  });
}

function sourceOffset(editor: TiptapEditor, position: number) {
  try {
    const manager = editor.markdown;
    if (manager === undefined) {
      throw new Error("the editor has no markdown converter");
    }
    const marked = editor.state.tr.insertText(SENTINEL, position);
    return fileMarkdown(
      manager,
      normalizeMarkdown(manager.serialize(marked.doc.toJSON()))
    ).indexOf(SENTINEL);
  } catch {
    return -1;
  }
}

function positionInDocument(
  editor: TiptapEditor,
  content: string,
  offset: number
) {
  const manager = editor.markdown;
  if (manager === undefined) {
    throw new Error("the editor has no markdown converter");
  }
  const at = Math.max(0, Math.min(offset, content.length));
  const marked = editor.schema.nodeFromJSON(
    manager.parse(content.slice(0, at) + SENTINEL + content.slice(at))
  );
  const clean = editor.schema.nodeFromJSON(manager.parse(content));
  return Math.min(findSentinel(marked) ?? 1, clean.content.size);
}

export interface EditorHandle {
  find: FindHandle;
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
}

interface EditorProps {
  findOpen?: boolean;
  focusModeEnabled?: boolean;
  focusOnMount?: boolean;
  /** Initial markdown BODY -- the editor owns the buffer after mount. */
  initialContent: string;
  onBlur?: () => void;
  onChange: (content: string, edit: DocumentEdit) => void;
  onHistory?: (direction: "undo" | "redo", execute: boolean) => boolean;
  /** Navigate when a markdown link to a note is clicked. */
  onNoteLinkClick?: (href: string) => void;
  onReady?: (handle: EditorHandle) => void;
  onSelect?: (anchor: number, head: number) => void;
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
export function Editor({
  findOpen = false,
  focusModeEnabled = false,
  ...mountProps
}: EditorProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const attachScrollArea = useCallback((root: HTMLDivElement | null) => {
    scrollAreaRef.current = root;
    scrollerRef.current =
      root?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null;
  }, []);
  const editorRef = useRef<null | TiptapEditor>(null);
  const suppressChangeRef = useRef(false);
  const focusModeRef = useRef(focusModeEnabled && !findOpen);
  const previousFocusModeRef = useRef(focusModeEnabled);

  useEffect(() => {
    focusModeRef.current = focusModeEnabled && !findOpen;
  });

  const [config] = useState(() => mountProps);
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [linkHover, setLinkHover] = useState<LinkHoverState | null>(null);
  const closeHoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reading, setReading] = useState(false);
  const [linkShortcut] = useState(() => {
    // ⌘K belongs to the palette, so the link keys sit under ⌘⇧: K makes one, O
    // follows the one at the caret, which is the only way there without a mouse.
    return Extension.create({
      addKeyboardShortcuts: () => ({
        "Mod-Shift-k": ({ editor: instance }) => {
          const { head } = instance.state.selection;
          const attrs = instance.getAttributes("link");
          const url = typeof attrs.href === "string" ? attrs.href : "";
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
          const { head } = instance.state.selection;
          const attrs = instance.getAttributes("link");
          const href = typeof attrs.href === "string" ? attrs.href : "";

          if (href !== "") {
            followLink(href, config.onNoteLinkClick);

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
    });
  });
  const [typewriter] = useState(() =>
    createTypewriter({
      enabled: () => focusModeRef.current,
      scroller: () => scrollerRef.current,
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

          return manager
            ? fileMarkdown(
                manager,
                normalizeMarkdown(manager.serialize(doc.toJSON()))
              )
            : fallback;
        } catch {
          return fallback;
        }
      },
      handleClickOn: (view, pos, node, _nodePos, event) => {
        const anchor =
          event.target instanceof Element
            ? event.target.closest("a[href]")
            : null;

        // `hrefAt` reads the marks at a position and comes up empty at a link's
        // left edge, where the anchor still knows where it goes.
        const href =
          hrefAt(view.state, pos) || (anchor?.getAttribute("href") ?? "");

        if (href !== "") {
          followLink(href, config.onNoteLinkClick);

          return true;
        }

        if (node.type.name === "wikilink" && config.onWikilinkClick) {
          config.onWikilinkClick(String(node.attrs.title ?? ""));

          return true;
        }

        return false;
      },
      handleDOMEvents: {
        // The webview follows an anchor on `click`. ProseMirror's own click
        // handling runs on `mouseup`, one event too early to stop it, so a
        // link's href would reach the webview past the scheme gate whenever
        // `handleClickOn` declines to handle it.
        click: (_view, event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a[href]") !== null
          ) {
            event.preventDefault();
          }

          return false;
        },
        // Closing on a delay is what makes the panel reachable: the pointer has
        // to cross a strip of editor to get to it, and closing on the way out
        // of the link would take it away mid-journey.
        mouseout: () => {
          closeHoverLater();

          return false;
        },
        mouseover: (view, event) => {
          const target =
            event.target instanceof Element
              ? event.target.closest("a[href], [data-wikilink]")
              : null;

          if (target === null) {
            return false;
          }

          const pos = view.posAtDOM(target, 0);
          const state = hoverStateFor(
            target,
            hrefAt(view.state, pos),
            config.resolveWikilink
          );

          if (state === null) {
            return false;
          }

          const rect = target.getBoundingClientRect();

          keepHover();
          setLinkHover({
            ...state,
            left: rect.left,
            pos,
            top: rect.bottom + 6,
          });

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
          const blob = imageItem.getAsFile();

          if (blob) {
            const reader = new FileReader();

            reader.addEventListener("error", () => {
              toast.add({
                title: "could not read the pasted image",
                type: "error",
              });
            });
            reader.addEventListener("load", async () => {
              const result =
                typeof reader.result === "string" ? reader.result : "";
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
                  .setImage({ src: encodeAttachmentPath(relativePath) })
                  .run();
              } catch (error) {
                toast.add({
                  description: reasonOf(error),
                  title: "could not paste image",
                  type: "error",
                });
              }
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
      typewriter,
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
            instance.commands.focus();
          }
        },
        getCaretSourceOffset: () => {
          const manager = instance.isDestroyed ? null : instance.markdown;

          if (!manager) {
            return -1;
          }

          try {
            const marked = instance.state.tr.insertText(
              SENTINEL,
              instance.state.selection.head
            );
            const md: string = manager.serialize(marked.doc.toJSON());

            // Source mode shows the file form, so the offset has to index it.
            return fileMarkdown(manager, normalizeMarkdown(md)).indexOf(
              SENTINEL
            );
          } catch {
            return -1;
          }
        },
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
          }
          suppressChangeRef.current = true;
          try {
            instance.view.dispatch(transaction.setMeta("addToHistory", false));
          } finally {
            suppressChangeRef.current = false;
          }
        },
      });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      setReading(false);
      // biome-ignore lint/suspicious/noUnnecessaryConditions: this mutable ref changes in editor and mode-switch callbacks
      if (!suppressChangeRef.current && config.onSelect !== undefined) {
        const { selection } = instance.state;
        const anchor = sourceOffset(instance, selection.anchor);
        const head = selection.empty
          ? anchor
          : sourceOffset(instance, selection.head);
        if (anchor >= 0 && head >= 0) {
          config.onSelect(anchor, head);
        }
      }
    },
    onTransaction: ({
      editor: instance,
      transaction,
      appendedTransactions,
    }) => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: this mutable ref changes in editor and mode-switch callbacks
      if (suppressChangeRef.current || transaction.getMeta("preventUpdate")) {
        return;
      }
      const transactions = [transaction, ...appendedTransactions];
      if (!transactions.some((entry) => entry.docChanged)) {
        return;
      }
      const { selection } = instance.state;
      const anchor = sourceOffset(instance, selection.anchor);
      const head = selection.empty
        ? anchor
        : sourceOffset(instance, selection.head);
      config.onChange(serializeMarkdown(instance), {
        headingEdited: transactions.some(touchesHeading),
        ...(anchor >= 0 && head >= 0 ? { selection: { anchor, head } } : {}),
      });
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
      const manager = editor.markdown;
      const diverged = (() => {
        try {
          const canonical = manager
            ? fileMarkdown(
                manager,
                normalizeMarkdown(manager.serialize(manager.parse(cleanBody)))
              )
            : serializeMarkdown(editor);

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

      const max = editor.state.doc.content.size;
      const chain = editor.chain();

      // A tab restored in the background places its caret without taking
      // focus: several editors mount at launch and only one is showing.
      if (config.focusOnMount === true) {
        chain.focus();
      }

      chain
        .setTextSelection(Math.min(pos, max))
        .setMeta(TYPEWRITER_SCROLL, "skip")
        .scrollIntoView()
        .run();
    } else if (config.focusOnMount === true) {
      editor.commands.focus("end");
    }
  }, [config, editor]);

  // The recenter rides the plugin's own meta so one animator owns every
  // scroll, and it is gated on a real off-to-on flip so a mount with the
  // pref already on pads without gliding.
  useEffect(() => {
    const wasEnabled = previousFocusModeRef.current;

    previousFocusModeRef.current = focusModeEnabled;

    const scroller = scrollerRef.current;
    const content = editor?.view.dom.parentElement;

    if (
      !focusModeEnabled ||
      editor === null ||
      scroller === null ||
      !(content instanceof HTMLElement)
    ) {
      return;
    }

    const recenter = () => {
      if (editor.isDestroyed) {
        return;
      }

      editor
        .chain()
        .setMeta(TYPEWRITER_SCROLL, "center")
        .scrollIntoView()
        .run();
    };
    const disengage = engageTypewriterPadding(scroller, content, recenter);

    if (!wasEnabled) {
      recenter();
    }

    return disengage;
  }, [editor, focusModeEnabled]);

  // Wheel and touchmove, never scroll: scroll also fires for the typewriter
  // glide and ProseMirror's own scrollIntoView, which move the scroller on
  // every keystroke (`D64`).
  useEffect(() => {
    const surface = scrollAreaRef.current;

    if (!focusModeEnabled || surface === null) {
      return;
    }

    const engage = () => {
      setReading(true);
    };

    // The other half of the clear in `onSelectionUpdate`: ProseMirror drops a
    // pointer selection equal to the current one before it ever becomes a
    // transaction, so a click on the caret already there reaches no callback.
    const restore = () => {
      setReading(false);
    };

    surface.addEventListener("wheel", engage, { passive: true });
    surface.addEventListener("touchmove", engage, { passive: true });
    surface.addEventListener("click", restore);

    return () => {
      surface.removeEventListener("wheel", engage);
      surface.removeEventListener("touchmove", engage);
      surface.removeEventListener("click", restore);
      setReading(false);
    };
  }, [focusModeEnabled]);

  const cancelLink = useCallback(() => {
    setLinkEditor(null);
    editor?.commands.focus();
  }, [editor]);

  const removeLink = useCallback(() => {
    setLinkEditor(null);
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
  }, [editor]);

  const keepHover = useCallback(() => {
    if (closeHoverRef.current !== null) {
      clearTimeout(closeHoverRef.current);
      closeHoverRef.current = null;
    }
  }, []);

  const closeHoverLater = useCallback(() => {
    keepHover();
    closeHoverRef.current = setTimeout(
      () => setLinkHover(null),
      HOVER_CLOSE_MS
    );
  }, [keepHover]);

  useEffect(() => keepHover, [keepHover]);

  // The panel opens the editor where it already sits, so the two are one
  // surface rather than two places a link is changed from.
  const editHoveredLink = useCallback(() => {
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

    setLinkHover(null);
    setLinkEditor((previous) => ({
      id: (previous?.id ?? 0) + 1,
      kind: title === null ? "link" : "wikilink",
      left: linkHover.left,
      text: title ?? wordsAt(editor.state),
      top: linkHover.top,
      url: title === null ? linkHover.url : "",
    }));
  }, [editor, linkHover]);

  const submitLink = useCallback(
    (rawUrl: string, text?: string) => {
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
    },
    [editor, linkEditor]
  );

  return (
    <ScrollArea
      className={cn(
        "allow-select min-h-0 flex-1",
        focusModeEnabled && "focus-mode-on",
        reading && "focus-reading"
      )}
      data-find-open={findOpen}
      ref={attachScrollArea}
    >
      <EditorContent className="min-h-full" editor={editor} />
      {linkHover === null || linkEditor !== null ? null : (
        <LinkHover
          onEdit={editHoveredLink}
          onPointerLeave={closeHoverLater}
          onPointerOver={keepHover}
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
