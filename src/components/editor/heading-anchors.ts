import type { Fragment, Node } from "@tiptap/pm/model";
import GithubSlugger from "github-slugger";

import { hasString } from "./attrs";

/** A link to a note reads as its title, an image as its alt. */
export function headingText(heading: Node) {
  return heading.textBetween(0, heading.content.size, "", (leaf) => {
    if (
      (leaf.type.name === "wikilink" || leaf.type.name === "embed") &&
      hasString(leaf.attrs, "title")
    ) {
      return leaf.attrs.title;
    }

    if (leaf.type.name === "image" && hasString(leaf.attrs, "alt")) {
      return leaf.attrs.alt;
    }

    return leaf.type.name === "hardBreak" ? " " : "";
  });
}

/** GitHub heading slugs mapped to caret positions in this content, in document order. */
export function headingAnchors(content: Fragment): Map<string, number> {
  const slugger = new GithubSlugger();
  const anchors = new Map<string, number>();

  content.descendants((node, position) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const slug = slugger.slug(headingText(node));

    if (slug !== "") {
      anchors.set(slug, position + 1);
    }

    return false;
  });

  return anchors;
}
