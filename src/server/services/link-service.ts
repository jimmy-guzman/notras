import { updateTag } from "next/cache";

import type { LinkId, NoteId } from "@/lib/id";
import type { SelectLink } from "@/server/db/schemas/links";
import type { LinkRepository } from "@/server/repositories/link-repository";
import type { OgMetadata } from "@/server/services/og-service";

import { generateLinkId, toLinkId } from "@/lib/id";
import { getDb } from "@/server/db";
import { DBLinkRepository } from "@/server/repositories/link-repository";
import { fetchOgMetadata } from "@/server/services/og-service";

const URL_PATTERN =
  /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(?<![[()])(https?:\/\/[^\s)>\]]+)/g;

export function extractUrls(content: string): string[] {
  const urls = new Set<string>();

  for (const match of content.matchAll(URL_PATTERN)) {
    const url = match[1] || match[2];

    if (url) {
      urls.add(url);
    }
  }

  return [...urls];
}

class LinkService {
  constructor(
    private linkRepo: LinkRepository,
    private idGenerator: () => LinkId = generateLinkId,
    private ogFetcher: (url: string) => Promise<OgMetadata> = fetchOgMetadata,
  ) {}

  async getByNoteId(userId: string, noteId: NoteId): Promise<SelectLink[]> {
    return this.linkRepo.findByNoteId(noteId, userId);
  }

  async syncLinks(
    userId: string,
    noteId: NoteId,
    content: string,
  ): Promise<void> {
    const urls = extractUrls(content);

    await this.linkRepo.deleteByNoteIdExcludingUrls(noteId, userId, urls);

    if (urls.length === 0) {
      return;
    }

    const existing = await this.linkRepo.findByNoteId(noteId, userId);
    const existingByUrl = new Map(existing.map((l) => [l.url, l]));

    const inputs = await Promise.all(
      urls.map(async (url) => {
        const existingLink = existingByUrl.get(url);

        if (existingLink) {
          return {
            description: existingLink.description,
            id: toLinkId(existingLink.id),
            noteId,
            title: existingLink.title,
            url,
            userId,
          };
        }

        const metadata = await this.ogFetcher(url);

        return {
          description: metadata.description,
          id: this.idGenerator(),
          noteId,
          title: metadata.title,
          url,
          userId,
        };
      }),
    );

    await this.linkRepo.upsertMany(inputs);
    updateTag("notes");
  }
}

let _linkService: LinkService | undefined;

export function getLinkService() {
  _linkService ??= new LinkService(new DBLinkRepository(getDb()));

  return _linkService;
}
