import type { MarkdownConfig } from "@lezer/markdown";

import { Tag } from "@lezer/highlight";

export const frontmatterContent = Tag.define();
export const frontmatterMark = Tag.define();

const DELIMITER = /^---\s*$/;
const CLOSING = /^(?:---|\.\.\.)\s*$/;

/**
 * Teach the markdown parser about the frontmatter block at document start.
 * Without this, `---` / `key: value` / `---` misparses as a horizontal rule
 * followed by a setext heading -- bold key lines and a thick second divider.
 * The recognized dialect matches `src/core/frontmatter.ts`.
 */
export const frontmatterExtension: MarkdownConfig = {
  defineNodes: [
    { block: true, name: "Frontmatter", style: frontmatterContent },
    { name: "FrontmatterMark", style: frontmatterMark },
  ],
  parseBlock: [
    {
      before: "HorizontalRule",
      name: "Frontmatter",
      parse: (cx, line) => {
        if (cx.lineStart !== 0 || !DELIMITER.test(line.text)) {
          return false;
        }

        const children = [cx.elt("FrontmatterMark", 0, line.text.length)];

        while (cx.nextLine()) {
          if (CLOSING.test(line.text)) {
            children.push(
              cx.elt(
                "FrontmatterMark",
                cx.lineStart,
                cx.lineStart + line.text.length,
              ),
            );
            cx.nextLine();

            break;
          }
        }

        // An unclosed block still gets marked to end-of-input. parseNote
        // treats that case as plain body -- a styling-only divergence for
        // a shape that never round-trips through the app's own writers.
        cx.addElement(cx.elt("Frontmatter", 0, cx.prevLineEnd(), children));

        return true;
      },
    },
  ],
};
