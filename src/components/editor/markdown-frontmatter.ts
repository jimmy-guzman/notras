import type { LanguageFn } from "lowlight";

import { common } from "lowlight";

const { markdown } = common;

if (markdown === undefined) {
  throw new Error("lowlight's common set no longer carries markdown");
}

const OPEN = /^---$/;

/**
 * Both closes `parseNote` accepts, trailing spaces and all, so the two agree.
 * `[^\S\n]` and not `\s`: highlight.js compiles these multiline, and matching
 * the newline would run the block on past its delimiter.
 */
const CLOSE = /^(?:---|\.{3})[^\S\n]*$/;

/**
 * highlight.js ships no frontmatter rule, so its setext-heading mode reads a
 * closing `---` as an underline and paints the key line above it as a heading.
 * A YAML block placed ahead of that mode beats it to the match and gives the
 * block real keys, values and delimiters.
 */
export const markdownWithFrontmatter: LanguageFn = (hljs) => {
  const base = markdown(hljs);

  return {
    ...base,
    contains: [
      {
        begin: OPEN,
        end: CLOSE,
        // Frontmatter is the block at offset 0 and nothing else: further down
        // a `---` pair is two thematic breaks with markdown between them.
        "on:begin": (match, response) => {
          if (match.index !== 0) {
            response.ignoreMatch();
          }
        },
        // Autodetect scores an unlabelled fence (`extensions.ts`), and this
        // mode exists to fix rendering, not to make markdown a likelier guess.
        relevance: 0,
        subLanguage: "yaml",
      },
      ...base.contains,
    ],
  };
};
