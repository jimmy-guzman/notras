import type { Theme } from "@pierre/highlights";

/**
 * Token categories use the same ink roles as the surrounding note surface.
 * Each color is the suffix of a `--syntax-` variable in `styles.css`, and a
 * category left out here inherits its parent's or stays in the text color.
 */
export const syntaxTheme = {
  appearance: "dark",
  cssVariables: { prefix: "--syntax-" },
  name: "notras",
  style: {
    syntax: {
      attribute: "member",
      boolean: "number",
      comment: "comment",
      constant: "number",
      "diff.minus": "removed",
      "diff.plus": "added",
      emphasis: "keyword",
      function: "function",
      keyword: "keyword",
      "keyword.control": "keyword-control",
      "keyword.import": "keyword-import",
      label: "member",
      link_uri: "function",
      namespace: "member",
      number: "number",
      operator: "operator",
      preproc: "keyword-control",
      property: "member",
      punctuation: "punctuation",
      selector: "tag",
      "selector.class": "member",
      "selector.id": "member",
      "selector.pseudo": "member",
      string: "string",
      "string.escape": "operator",
      "string.regex": "operator",
      tag: "tag",
      "text.literal": "string",
      title: "keyword",
      type: "type",
    },
  },
} satisfies Theme;
