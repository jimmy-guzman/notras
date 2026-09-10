import { parseNote } from "@/core/frontmatter";
import { retitleLeadingHeading } from "@/core/notes";

const LINE_BREAK = /[\r\n]/;

const HEADING = /^ {0,3}#(?:[ \t]|$)/;

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

/** The naming heading's source range, including its Markdown marker. */
export function headingRange(
  content: string
): { from: number; to: number } | undefined {
  const { body } = parseNote(content);
  let from = content.length - body.length;
  for (const line of body.split("\n")) {
    if (line.trim() !== "") {
      return HEADING.test(line) ? { from, to: from + line.length } : undefined;
    }
    from += line.length + 1;
  }
  return undefined;
}
