import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

import { frontmatterContent, frontmatterMark } from "./frontmatter-extension";

/**
 * iA-Writer-flavored live styling: the markdown source stays visible, but
 * structure reads at a glance -- big headings, real bold/italic, muted marks.
 * Colors come from the app's CSS variables so light/dark follow the system.
 */
const markdownHighlightStyle = HighlightStyle.define([
  // Frontmatter reads as quiet metadata: both dividers identical, no
  // heading weight (see frontmatter-extension.ts).
  {
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-editor-mono)",
    fontSize: "0.85em",
    tag: frontmatterContent,
  },
  { color: "var(--muted-foreground)", tag: frontmatterMark },
  { fontSize: "1.6em", fontWeight: "700", tag: tags.heading1 },
  { fontSize: "1.35em", fontWeight: "700", tag: tags.heading2 },
  { fontSize: "1.15em", fontWeight: "700", tag: tags.heading3 },
  { fontWeight: "700", tag: tags.heading4 },
  { fontWeight: "700", tag: tags.heading5 },
  { fontWeight: "700", tag: tags.heading6 },
  { fontWeight: "700", tag: tags.strong },
  { fontStyle: "italic", tag: tags.emphasis },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { color: "var(--muted-foreground)", tag: tags.quote },
  {
    color: "var(--muted-foreground)",
    tag: [tags.processingInstruction, tags.meta, tags.punctuation],
  },
  { color: "var(--muted-foreground)", tag: tags.contentSeparator },
  { color: "var(--primary)", tag: tags.link, textDecoration: "underline" },
  { color: "var(--muted-foreground)", tag: tags.url },
  {
    fontFamily: "var(--font-editor-mono)",
    fontSize: "0.9em",
    tag: tags.monospace,
  },
  // Inside fenced code blocks (via @codemirror/language-data).
  { color: "var(--chart-2)", tag: [tags.keyword, tags.operatorKeyword] },
  { color: "var(--chart-3)", tag: [tags.string, tags.special(tags.string)] },
  { color: "var(--chart-1)", tag: [tags.function(tags.variableName)] },
  { color: "var(--chart-4)", tag: [tags.number, tags.bool, tags.atom] },
  { color: "var(--muted-foreground)", fontStyle: "italic", tag: tags.comment },
  { color: "var(--chart-5)", tag: [tags.typeName, tags.className] },
]);

export const markdownHighlight = syntaxHighlighting(markdownHighlightStyle, {
  fallback: true,
});
