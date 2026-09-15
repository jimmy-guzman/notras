import { parseNote } from "@/core/frontmatter";
import { ATX_HEADING as HEADING, retitleLeadingHeading } from "@/core/notes";

const LINE_BREAK = /[\r\n]/u;

/** Set the naming heading, introducing it when the note has none. */
export function renameDocument(content: string, title: string): string {
  const name = title.trim();
  if (name === "" || LINE_BREAK.test(name)) {
    throw new Error("a name must be one nonempty line");
  }
  const parsed = parseNote(content);
  const heading = parsed.body.split("\n").find((line) => line.trim() !== "");
  const body =
    heading !== undefined && HEADING.test(heading)
      ? retitleLeadingHeading(parsed.body, name)
      : `# ${name}\n\n${parsed.body}`;
  return content.slice(0, content.length - parsed.body.length) + body;
}
