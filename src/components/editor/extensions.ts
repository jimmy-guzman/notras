import type { Editor, Extensions } from "@tiptap/core";

import { Extension, InputRule } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Focus, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

import { SlashMenu } from "./slash-menu";
import { Wikilink } from "./wikilink";

export interface EditorExtensionOptions {
  getTitles?: () => string[];
  onWikilinkClick?: (title: string) => void;
  placeholderText?: string;
  resolveImageSrc?: (src: string) => string;
}

const lowlight = createLowlight(common);

const NoteImage = Image.extend<
  Record<string, unknown> & { resolveSrc: (src: string) => string }
>({
  addOptions() {
    return {
      ...this.parent?.(),
      resolveSrc: (src: string) => {
        return src;
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const src =
      typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";

    // The doc attribute keeps the relative path so markdown serialization
    // stays faithful; only the rendered element gets the resolved URL.
    return ["img", { ...HTMLAttributes, src: this.options.resolveSrc(src) }];
  },
});

/** Typing `[text](url)` converts into a real link as you close the paren. */
const MarkdownLinkInputRule = Extension.create({
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^\s)]+)\)$/,
        handler: ({ commands, match, range, state }) => {
          const [, text, url] = match;

          if (text === undefined || url === undefined) {
            return;
          }

          commands.command(({ tr }) => {
            const linkMark = state.schema.marks.link;

            if (linkMark === undefined) {
              return false;
            }

            tr.replaceWith(
              range.from,
              range.to,
              state.schema.text(text, [linkMark.create({ href: url })]),
            );

            return true;
          });
        },
      }),
    ];
  },
  name: "markdownLinkInputRule",
});

/**
 * Serialize the editor to markdown for the file on disk. TipTap leaks
 * `&nbsp;` entities (table cells, blank paragraphs); files must stay
 * clean, portable markdown.
 */
export function serializeMarkdown(editor: Editor) {
  return editor.getMarkdown().replaceAll(/&nbsp;|&#160;/g, " ");
}

/** The full extension stack, shared by the component and headless tests. */
export function createEditorExtensions(
  options: EditorExtensionOptions,
): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false },
    }),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
    CodeBlockLowlight.configure({ lowlight }),
    TableKit.configure({
      table: {
        // Hand-styled in styles.css; not-prose stops double-styling.
        HTMLAttributes: { class: "not-prose" },
        resizable: false,
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoteImage.configure({
      resolveSrc:
        options.resolveImageSrc ??
        ((src: string) => {
          return src;
        }),
    }),
    Placeholder.configure({
      placeholder: options.placeholderText ?? "just write...",
    }),
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    MarkdownLinkInputRule,
    SlashMenu,
    Wikilink.configure({
      getTitles:
        options.getTitles ??
        (() => {
          return [];
        }),
      onNavigate: options.onWikilinkClick,
    }),
  ];
}
