import type { Editor as TiptapEditor } from "@tiptap/core";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { attachImage } from "@/data/attach-file";
import { cn } from "@/lib/ui/utils";

import { createEditorExtensions, serializeMarkdown } from "./extensions";
import { ANCHOR_LENGTH, blockIndexToPos, findAnchor } from "./source-anchors";

interface BlockLike {
  descendants(
    callback: (
      node: { isText: boolean; nodeSize: number; text?: string },
      pos: number,
    ) => boolean,
  ): void;
}

/**
 * Map a visible-text offset within a top-level block back to a ProseMirror
 * position. Counts text runs by length and leaf atoms as one character,
 * mirroring how `textBetween(..., " ", " ")` produced the searched text.
 */
function textOffsetToPos(block: BlockLike, blockStart: number, offset: number) {
  let remaining = offset;
  let result = blockStart;

  block.descendants((node, pos) => {
    if (remaining < 0) {
      return false;
    }

    if (node.isText) {
      const length = node.text?.length ?? 0;

      if (remaining <= length) {
        result = blockStart + pos + remaining;
        remaining = -1;

        return false;
      }

      remaining -= length;
    } else if (node.nodeSize === 1) {
      // Inline leaf atom, rendered as one placeholder character.
      remaining -= 1;
      if (remaining <= 0) {
        result = blockStart + pos + 1;
        remaining = -1;

        return false;
      }
    }

    return true;
  });

  return remaining >= 0 ? blockStart : result;
}

const MARKDOWN_PASTE_PATTERN =
  /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|```|^\s*\[.*\]\(.*\)|^\s*!\[|\*\*.*\*\*|~~.*~~|^\s*[-*_]{3,}\s*$|^\|.+\|/m;

export interface EditorHandle {
  focus(): void;
  getContent(): string;
  /** The caret's top-level block plus the visible text just before it. */
  getCursorContext(): { anchorText: string; blockIndex: number };
  insertText(text: string): void;
  /**
   * Move the caret into the Nth top-level block, at the spot where
   * `anchorText` ends (block start when the anchor can't be found).
   */
  setCursorInBlock(index: number, anchorText: string): void;
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
  const typewriterRef = useRef(typewriterEnabled);

  useEffect(() => {
    typewriterRef.current = typewriterEnabled;
  });

  const [config] = useState(() => {
    return mountProps;
  });

  const editor = useEditor({
    autofocus: config.focusOnMount === true ? "end" : false,
    content: config.initialContent,
    contentType: "markdown",
    editorProps: {
      attributes: {
        autocapitalize: "off",
        autocorrect: "off",
        class:
          "note-preview-prose prose prose-stone dark:prose-invert mx-auto w-full max-w-2xl px-6 py-6 focus:outline-none",
        spellcheck: "true",
      },
      // Copying out of the editor puts markdown on the clipboard.
      clipboardTextSerializer: (slice, view) => {
        const fallback = slice.content.textBetween(
          0,
          slice.content.size,
          "\n\n",
        );

        try {
          const doc = view.state.schema.topNodeType.create(null, slice.content);
          const manager = editorRef.current?.markdown;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- ProseMirror types Node.toJSON() as any at the library boundary
          return manager ? manager.serialize(doc.toJSON()) : fallback;
        } catch {
          return fallback;
        }
      },
      handleClickOn: (_view, _pos, node) => {
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
        const imageItem = [...clipboard.items].find((item) => {
          return item.type.startsWith("image/");
        });

        if (imageItem) {
          const blob = imageItem.getAsFile();

          if (blob) {
            const reader = new FileReader();

            reader.addEventListener("load", () => {
              const result =
                typeof reader.result === "string" ? reader.result : "";
              const base64 = result.split(",")[1] ?? "";

              void attachImage(base64)
                .then((relativePath) => {
                  editorRef.current
                    ?.chain()
                    .focus()
                    .setImage({ src: relativePath })
                    .run();

                  return undefined;
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "could not paste image",
                  );
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
    immediatelyRender: false,
    extensions: createEditorExtensions({
      getTitles: config.titles,
      onWikilinkClick: config.onWikilinkClick,
      placeholderText: config.placeholderText,
      resolveImageSrc: config.resolveImageSrc,
    }),
    onBlur: () => {
      config.onBlur?.();
    },
    onCreate: ({ editor: instance }) => {
      editorRef.current = instance;
      config.onReady?.({
        focus: () => {
          instance.commands.focus();
        },
        getContent: () => {
          return serializeMarkdown(instance);
        },
        getCursorContext: () => {
          const { doc, selection } = instance.state;
          const from = Math.min(selection.from, doc.content.size);
          const resolved = doc.resolve(from);
          const blockIndex = resolved.index(0);
          const blockStart = blockIndexToPos(doc, blockIndex);

          return {
            anchorText: doc
              .textBetween(Math.min(blockStart, from), from, "", " ")
              .slice(-ANCHOR_LENGTH),
            blockIndex,
          };
        },
        insertText: (text) => {
          instance.commands.insertContent(text, { contentType: "markdown" });
          instance.commands.focus();
        },
        setCursorInBlock: (index, anchorText) => {
          const { doc } = instance.state;
          const clamped = Math.max(0, Math.min(index, doc.childCount - 1));
          const blockStart = blockIndexToPos(doc, clamped);
          const block = doc.child(clamped);
          const blockText = doc.textBetween(
            blockStart,
            blockStart + block.content.size,
            "",
            " ",
          );
          const matched =
            anchorText === "" ? -1 : findAnchor(blockText, anchorText);
          const pos =
            matched === -1
              ? blockStart
              : textOffsetToPos(block, blockStart, matched);

          instance.chain().focus().setTextSelection(pos).scrollIntoView().run();
        },
      });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      // Typewriter scrolling: keep the caret vertically centered.
      if (!typewriterRef.current) {
        return;
      }

      const scroller = scrollerRef.current;

      if (scroller === null) {
        return;
      }

      const coords = instance.view.coordsAtPos(instance.state.selection.head);
      const rect = scroller.getBoundingClientRect();

      scroller.scrollTop += coords.top - (rect.top + rect.height / 2);
    },
    onUpdate: ({ editor: instance }) => {
      config.onChange(serializeMarkdown(instance));
    },
  });

  return (
    <div
      className={cn(
        "allow-select min-h-0 flex-1 overflow-y-auto",
        focusModeEnabled && "focus-mode-on",
      )}
      ref={scrollerRef}
    >
      <EditorContent className="min-h-full" editor={editor} />
    </div>
  );
}
