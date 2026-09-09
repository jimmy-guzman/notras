import type { ThemeRegistration } from "shiki/types";

/** TextMate scopes use the same ink roles as the surrounding note surface. */
export const syntaxTheme: ThemeRegistration = {
  colors: {
    "editor.background": "var(--card)",
    "editor.foreground": "var(--foreground)",
  },
  name: "notras",
  tokenColors: [
    { scope: "comment", settings: { foreground: "var(--syntax-comment)" } },
    {
      scope: ["keyword", "storage"],
      settings: { foreground: "var(--syntax-keyword)" },
    },
    {
      scope: ["keyword.control", "storage.modifier.async"],
      settings: { foreground: "var(--syntax-keyword-control)" },
    },
    {
      scope: [
        "keyword.control.import",
        "keyword.control.export",
        "keyword.control.from",
        "keyword.control.default",
      ],
      settings: { foreground: "var(--syntax-keyword-import)" },
    },
    {
      scope: ["keyword.operator", "punctuation.accessor", "operator"],
      settings: { foreground: "var(--syntax-operator)" },
    },
    { scope: "string", settings: { foreground: "var(--syntax-string)" } },
    {
      scope: ["constant.character.escape", "string.regexp"],
      settings: { foreground: "var(--syntax-operator)" },
    },
    {
      scope: ["constant", "support.constant", "variable.other.constant"],
      settings: { foreground: "var(--syntax-number)" },
    },
    {
      scope: ["entity.name.function", "support.function"],
      settings: { foreground: "var(--syntax-function)" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
      ],
      settings: { foreground: "var(--syntax-type)" },
    },
    {
      scope: [
        "variable.other.property",
        "meta.object-literal.key",
        "support.variable",
        "entity.name.namespace",
        "entity.name.label",
        "entity.name.tag.yaml",
        "support.type.property-name",
      ],
      settings: { foreground: "var(--syntax-member)" },
    },
    {
      scope: "entity.name.tag",
      settings: { foreground: "var(--syntax-tag)" },
    },
    {
      scope: "entity.other.attribute-name",
      settings: { foreground: "var(--syntax-member)" },
    },
    {
      scope: ["variable", "meta.embedded", "meta.template.expression"],
      settings: { foreground: "var(--foreground)" },
    },
    {
      scope: "punctuation",
      settings: { foreground: "var(--syntax-punctuation)" },
    },
    {
      scope: ["markup.heading", "markup.bold", "markup.italic"],
      settings: { foreground: "var(--syntax-keyword)" },
    },
    {
      scope: ["markup.inline.raw", "markup.raw"],
      settings: { foreground: "var(--syntax-string)" },
    },
    {
      scope: "markup.underline.link",
      settings: { foreground: "var(--syntax-function)" },
    },
  ],
};
