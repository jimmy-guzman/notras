import type { Fragment } from "@tiptap/pm/model";
import GithubSlugger from "github-slugger";

import { hasString } from "./attrs";

/** GitHub heading slugs mapped to caret positions in this content, in document order. */
export function headingAnchors(content: Fragment): Map<string, number> {
  const slugger = new GithubSlugger();
  const anchors = new Map<string, number>();

  content.descendants((node, position) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const text = node.textBetween(0, node.content.size, "", (leaf) => {
      if (leaf.type.name === "wikilink" && hasString(leaf.attrs, "title")) {
        return leaf.attrs.title;
      }
      if (leaf.type.name === "image" && hasString(leaf.attrs, "alt")) {
        return leaf.attrs.alt;
      }
      return leaf.type.name === "hardBreak" ? " " : "";
    });
    const slug = slugger.slug(text);

    if (slug !== "") {
      anchors.set(slug, position + 1);
    }
    return false;
  });

  return anchors;
}
