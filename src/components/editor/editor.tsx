import { openUrl } from "@tauri-apps/plugin-opener";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { attachImage } from "@/data/attach-file";
import { errorMessage } from "@/lib/ui/failure";
import { cn } from "@/lib/ui/utils";
import { encodeAttachmentPath } from "@/lib/utils/attachments";
import {
  createEditorExtensions,
  normalizeMarkdown,
  serializeMarkdown,
} from "./extensions";
import type { LinkEditorState } from "./link-editor";
import { LinkEditor } from "./link-editor";
import { findSentinel, SENTINEL } from "./sentinel";
import {
  createTypewriter,
  engageTypewriterPadding,
  TYPEWRITER_SCROLL,
} from "./typewriter";
import { isSafeUrl, normalizeUrl } from "./urls";

const UNSAFE_LINK_MESSAGE = "that link uses a scheme notras will not open";

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|```|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\|/m;

/**
 * Every method no-ops on a destroyed editor. ⌘P swaps the rich surface for the
 * source one, and the session's ref keeps pointing at the handle it was given,
 * so a handle outliving its instance is a state the design permits.
 */
export interface EditorHandle {
  focus: () => void;
  /**
   * The caret's exact offset in this buffer's markdown serialization,
   * found by serializing a throwaway clone with a sentinel at the caret.
   * -1 when it cannot be determined.
   */
  getCaretSourceOffset: () => number;
  getContent: () => string;
  insertText: (text: string) => void;
}

interface EditorProps {
  focusModeEnabled?: boolean;
  focusOnMount?: boolean;
  /** Initial markdown BODY -- the editor owns the buffer after mount. */
  initialContent: string;
  onBlur?: () => void;
  onChange: (content: string) => void;
  onReady?: (handle: EditorHandle) => void;
  /** Navigate when a wikilink pill is clicked. */
  onWikilinkClick?: (title: string) => void;
  placeholderText?: string;
  /** Resolve image sources (e.g. `attachments/x.png`) to loadable URLs. */
  resolveImageSrc?: (src: string) => string;
  /**
   * The initial content carries a SENTINEL at the caret spot (source-mode
   * exit): strip it after mount and place the caret exactly there.
   */
  stripSentinel?: boolean;
  /** Stable getter for live note titles (wikilink completion). */
  titles?: () => string[];
  typewriterEnabled?: boolean;
}

/**
 * TipTap WYSIWYG markdown editor. All props except the writing-mode toggles
 * are frozen at mount: the editor owns the buffer, so remount (via `key`)
 * to load different content. Callbacks must therefore be safe to freeze --
 * read live values through refs, not closures. Content in/out is markdown
 * (`@tiptap/markdown`); the buffer is the note BODY, never frontmatter.
 */
export function Editor({
  focusModeEnabled = false,
  typewriterEnabled = false,
  ...mountProps
}: EditorProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<null | TiptapEditor>(null);
  const suppressChangeRef = useRef(false);
  const typewriterRef = useRef(typewriterEnabled);
  const previousTypewriterRef = useRef(typewriterEnabled);

  useEffect(() => {
    typewriterRef.current = typewriterEnabled;
  });

  const [config] = useState(() => mountProps);
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
  const [reading, setReading] = useState(false);
  const [linkShortcut] = useState(() => {
    // ⌘⇧K: open the link popover at the caret (⌘K belongs to the palette).
    return Extension.create({
      addKeyboardShortcuts: () => ({
        "Mod-Shift-k": ({ editor: instance }) => {
          const { empty, head } = instance.state.selection;
          const attrs = instance.getAttributes("link");
          const url = typeof attrs.href === "string" ? attrs.href : "";
          const coords = instance.view.coordsAtPos(head);

          setLinkEditor({
            left: coords.left,
            needsText: empty && url === "",
            top: coords.bottom + 6,
            url,
          });

          return true;
        },
      }),
      name: "linkShortcut",
    });
  });
  const [typewriter] = useState(() =>
    createTypewriter({
      enabled: () => typewriterRef.current,
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

          return manager ? manager.serialize(doc.toJSON()) : fallback;
        } catch {
          return fallback;
        }
      },
      handleClickOn: (view, pos, node, _nodePos, event) => {
        // ⌘/ctrl+click on a link opens it in the browser.
        if (event.metaKey || event.ctrlKey) {
          const link = view.state.doc
            .resolve(pos)
            .marks()
            .find((mark) => mark.type.name === "link");
          const href =
            typeof link?.attrs.href === "string" ? link.attrs.href : "";

          if (href !== "") {
            // Hrefs arrive from the file on disk (parse, paste, input rule),
            // never only from the link editor -- so gate the scheme here too.
            if (!isSafeUrl(href)) {
              toast.add({ title: UNSAFE_LINK_MESSAGE, type: "error" });

              return true;
            }

            openUrl(href).catch(() => {
              toast.add({ title: "could not open link", type: "error" });
            });

            return true;
          }
        }

        if (node.type.name === "wikilink" && config.onWikilinkClick) {
          config.onWikilinkClick(String(node.attrs.title ?? ""));

          return true;
        }

        return false;
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
            reader.addEventListener("load", () => {
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

              attachImage(base64)
                .then((relativePath) => {
                  editorRef.current
                    ?.chain()
                    .focus()
                    .setImage({ src: encodeAttachmentPath(relativePath) })
                    .run();
                })
                .catch((error: unknown) => {
                  toast.add({
                    title: errorMessage(error, "could not paste image"),
                    type: "error",
                  });
                });
            });
            reader.readAsDataURL(blob);

            return true;
          }
        }

        // Markdown-looking text pastes rich.
        const text = clipboard.getData("text/plain");

        if (text === "" || !MARKDOWN_PASTE_PATTERN.test(text)) {
          return false;
        }

        const instance = editorRef.current;

        if (!instance?.markdown) {
          return false;
        }

        try {
          instance.commands.insertContent(instance.markdown.parse(text));

          return true;
        } catch {
          return false;
        }
      },
    },
    extensions: [
      ...createEditorExtensions({
        getTitles: config.titles,
        placeholderText: config.placeholderText,
        resolveImageSrc: config.resolveImageSrc,
      }),
      linkShortcut,
      typewriter,
    ],
    immediatelyRender: false,
    onBlur: () => {
      config.onBlur?.();
    },
    onCreate: ({ editor: instance }) => {
      editorRef.current = instance;
      config.onReady?.({
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

            return normalizeMarkdown(md).indexOf(SENTINEL);
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
      });
    },
    onSelectionUpdate: () => {
      setReading(false);
    },
    onUpdate: ({ editor: instance }) => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: biome narrows useRef(false) to the false literal; the replace path assigns true
      if (suppressChangeRef.current) {
        return;
      }

      config.onChange(serializeMarkdown(instance));
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
            ? normalizeMarkdown(manager.serialize(manager.parse(cleanBody)))
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
    const wasEnabled = previousTypewriterRef.current;

    previousTypewriterRef.current = typewriterEnabled;

    const scroller = scrollerRef.current;
    const content = editor?.view.dom.parentElement;

    if (
      !typewriterEnabled ||
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
  }, [editor, typewriterEnabled]);

  // Wheel and touchmove, never scroll: scroll also fires for the typewriter
  // glide and ProseMirror's own scrollIntoView, which move the scroller on
  // every keystroke (`D64`).
  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!focusModeEnabled || scroller === null) {
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

    scroller.addEventListener("wheel", engage, { passive: true });
    scroller.addEventListener("touchmove", engage, { passive: true });
    scroller.addEventListener("click", restore);

    return () => {
      scroller.removeEventListener("wheel", engage);
      scroller.removeEventListener("touchmove", engage);
      scroller.removeEventListener("click", restore);
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

  const submitLink = useCallback(
    (rawUrl: string, text?: string) => {
      if (editor === null) {
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

      if (text === undefined) {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      } else if (text.trim() === "") {
        editor.commands.focus();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            marks: [{ attrs: { href }, type: "link" }],
            text: text.trim(),
            type: "text",
          })
          .run();
      }
    },
    [editor]
  );

  return (
    <div
      className={cn(
        "allow-select min-h-0 flex-1 overflow-y-auto",
        focusModeEnabled && "focus-mode-on",
        reading && "focus-reading",
        typewriterEnabled && "typewriter-on"
      )}
      ref={scrollerRef}
    >
      <EditorContent className="min-h-full" editor={editor} />
      {linkEditor === null || editor === null ? null : (
        <LinkEditor
          onCancel={cancelLink}
          onRemove={removeLink}
          onSubmit={submitLink}
          state={linkEditor}
        />
      )}
    </div>
  );
}
