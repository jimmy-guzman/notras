import { Context, Effect, Layer } from "effect";
import { format } from "oxfmt";

interface IFormatService {
  formatMarkdown(content: string): Effect.Effect<string>;
}

export class FormatService extends Context.Tag("FormatService")<
  FormatService,
  IFormatService
>() {}

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

const makeFormatService: IFormatService = {
  formatMarkdown: (content) => Effect.promise(() => formatMarkdown(content)),
};

export const FormatServiceLive = Layer.succeed(
  FormatService,
  makeFormatService,
);
