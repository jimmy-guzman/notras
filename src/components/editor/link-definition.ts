import { Node } from "@tiptap/core";

const TRAILING_NEWLINES = /\n+$/u;

/**
 * A link reference definition, `[label]: destination`, kept as the author's
 * text and shown as code. marked renders it to no HTML, so it needs a node of
 * its own for the save to write it back.
 */
export const LinkDefinition = Node.create({
  code: true,
  content: "text*",
  group: "block",
  markdownTokenName: "def",
  marks: "",
  name: "linkDefinition",
  parseHTML() {
    return [{ preserveWhitespace: "full", tag: "pre[data-definition]" }];
  },
  parseMarkdown: (token, helpers) => {
    if (token.raw === undefined) {
      throw new Error("The definition token has no source text");
    }

    return helpers.createNode("linkDefinition", undefined, [
      // marked keeps the line ending that closes the block, which the file
      // around the node writes, not its text.
      helpers.createTextNode(token.raw.replace(TRAILING_NEWLINES, "")),
    ]);
  },
  renderHTML: () => ["pre", { "data-definition": "" }, 0],
  renderMarkdown: (node, _helpers, context) => {
    const text = (node.content ?? []).map((child) => child.text ?? "").join("");

    const inItem =
      context.parentType === "listItem" || context.parentType === "taskItem";

    // An item that opens with a definition leads with an empty paragraph,
    // which writes a bare marker, and an item cannot open with two blank lines.
    const opensItem =
      context.previousNode?.type === "paragraph" &&
      (context.previousNode.content ?? []).length === 0;

    // An item writes its blocks a line apart, where a definition cannot
    // interrupt the paragraph or list above it and reads as that block's text.
    return inItem && !opensItem ? `\n${text}` : text;
  },
  whitespace: "pre",
});
