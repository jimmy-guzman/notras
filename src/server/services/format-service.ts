import { format } from "oxfmt";

export async function formatMarkdown(content: string): Promise<string> {
  try {
    const { code, errors } = await format("note.md", content);

    if (errors.length > 0) {
      return content;
    }

    return code;
  } catch {
    return content;
  }
}
