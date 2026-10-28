import { parseNote } from "@/core/frontmatter";
import { ATX_HEADING as HEADING } from "@/core/notes";

const LINE_BREAK = /[\r\n]/u;

/**
 * Set the naming heading, introducing it when the note has none. An existing
 * heading keeps its indentation.
 */
export function renameDocument(content: string, title: string): string {
  const name = title.trim();

  if (name === "" || LINE_BREAK.test(name)) {
    throw new Error("A name must be one nonempty line");
  }

  const parsed = parseNote(content);
  const lines = parsed.body.split("\n");
  const index = lines.findIndex((line) => line.trim() !== "");
  const heading = index === -1 ? undefined : lines[index];

  const body =
    heading !== undefined && HEADING.test(heading)
      ? lines
          .with(index, `${heading.slice(0, heading.indexOf("#"))}# ${name}`)
          .join("\n")
      : `# ${name}\n\n${parsed.body}`;

  return content.slice(0, content.length - parsed.body.length) + body;
}
