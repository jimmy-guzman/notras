import { Context, Effect, Layer } from "effect";

interface OgMetadata {
  description: null | string;
  title: null | string;
}

interface IOgService {
  fetchOgMetadata(url: string): Effect.Effect<OgMetadata>;
}

export class OgService extends Context.Tag("OgService")<
  OgService,
  IOgService
>() {}

const OG_FETCH_TIMEOUT_MS = 5000;

function parseOgTag(html: string, property: string): null | string {
  const pattern = new RegExp(
    `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["'][^>]*/?>` +
      `|<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["'][^>]*/?>`,
    "i",
  );

  const match = pattern.exec(html);

  if (!match) {
    return null;
  }

  return match[1] || match[2] || null;
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "notras-bot/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(OG_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { description: null, title: null };
    }

    const html = await response.text();

    return {
      description: parseOgTag(html, "description"),
      title: parseOgTag(html, "title"),
    };
  } catch {
    return { description: null, title: null };
  }
}

const makeOgService: IOgService = {
  fetchOgMetadata: (url) => Effect.promise(() => fetchOgMetadata(url)),
};

export const OgServiceLive = Layer.succeed(OgService, makeOgService);
