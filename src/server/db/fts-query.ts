import { asc, desc, sql } from "drizzle-orm";

import { SNIPPET_END, SNIPPET_START } from "@/core";
import { note } from "@/server/db/schema";

export function buildFtsMatchQuery(query: string | undefined) {
  if (query === undefined) {
    return undefined;
  }

  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => {
      return term.trim();
    })
    .map((term) => {
      return term.replaceAll(/[^\p{L}\p{N}_]+/gu, "");
    })
    .filter((term) => {
      return term.length > 0;
    });

  if (terms.length === 0) {
    return undefined;
  }

  return terms
    .map((term) => {
      return `${term}*`;
    })
    .join(" AND ");
}

function getSearchRankExpression(matchQuery: string) {
  return sql<number>`(
    SELECT bm25(note_fts)
    FROM note_fts
    WHERE note_fts.path = note.path
      AND note_fts MATCH ${matchQuery}
  )`;
}

export function getSnippetExpression(matchQuery: string | undefined) {
  if (matchQuery === undefined) {
    return sql<null>`NULL`;
  }

  return sql<string>`(
    SELECT snippet(
      note_fts,
      2,
      ${SNIPPET_START},
      ${SNIPPET_END},
      '...',
      24
    )
    FROM note_fts
    WHERE note_fts.path = note.path
      AND note_fts MATCH ${matchQuery}
  )`;
}

export function getSearchOrderBy(matchQuery: string) {
  const rank = getSearchRankExpression(matchQuery);

  return [asc(rank), desc(note.updatedAt), asc(note.path)];
}

export function getFtsMatchFilter(matchQuery: string) {
  return sql`note.path IN (
    SELECT note_fts.path FROM note_fts WHERE note_fts MATCH ${matchQuery}
  )`;
}
