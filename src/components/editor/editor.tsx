import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/ui/utils";

import { createEditorExtensions } from "./extensions";

export interface EditorHandle {
  focus(): void;
  getContent(): string;
  insertText(text: string): void;
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
        class:
          "note-preview-prose prose prose-stone dark:prose-invert mx-auto w-full max-w-2xl px-6 py-6 focus:outline-none",
      },
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name === "wikilink" && config.onWikilinkClick) {
          config.onWikilinkClick(String(node.attrs.title ?? ""));

          return true;
        }

        return false;
      },
    },
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
      config.onReady?.({
        focus: () => {
          instance.commands.focus();
        },
        getContent: () => {
          return instance.getMarkdown();
        },
        insertText: (text) => {
          instance.commands.insertContent(text, { contentType: "markdown" });
          instance.commands.focus();
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
      config.onChange(instance.getMarkdown());
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
