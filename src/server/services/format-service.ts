import { Context, Effect, Layer } from "effect";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { parseNote } from "@/core";

interface IFormatService {
  formatMarkdown(content: string): Effect.Effect<string>;
}

export class FormatService extends Context.Tag("FormatService")<
  FormatService,
  IFormatService
>() {}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    strong: "*",
  });

/**
 * Format a note's markdown body, leaving the frontmatter block untouched.
 * Runs on blur/note-switch (never mid-keystroke) and returns the original
 * content on any error -- formatting must never lose what was written.
 */
export async function formatMarkdown(content: string): Promise<string> {
  try {
    const { body, rawLines } = parseNote(content);
    const formatted = String(await processor.process(body));

    if (formatted.trim() === "" && body.trim() !== "") {
      return content;
    }

    if (rawLines.length === 0) {
      return formatted;
    }

    return `---\n${rawLines.join("\n")}\n---\n${formatted}`;
  } catch {
    return content;
  }
}

const makeFormatService: IFormatService = {
  formatMarkdown: (content) => {
    return Effect.promise(() => {
      return formatMarkdown(content);
    });
  },
};

export const FormatServiceLive = Layer.succeed(
  FormatService,
  makeFormatService,
);
