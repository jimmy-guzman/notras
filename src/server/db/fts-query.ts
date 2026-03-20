import { asc, desc, sql } from "drizzle-orm";

import { SNIPPET_END, SNIPPET_START } from "@/server/db/fts-markers";
import { note } from "@/server/db/schemas/notes";

export function buildFtsMatchQuery(query: string | undefined) {
  if (query === undefined) {
    return undefined;
  }

  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .map((term) => term.replaceAll(/[^\p{L}\p{N}_]+/gu, ""))
    .filter((term) => term.length > 0);

  if (terms.length === 0) {
    return undefined;
  }

  return terms.map((term) => `${term}*`).join(" AND ");
}

function getSearchRankExpression(matchQuery: string) {
  return sql<number>`(
    SELECT bm25(note_fts)
    FROM note_fts
    WHERE note_fts.rowid = note.rowid
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
      0,
      ${SNIPPET_START},
      ${SNIPPET_END},
      '...',
      24
    )
    FROM note_fts
    WHERE note_fts.rowid = note.rowid
      AND note_fts MATCH ${matchQuery}
  )`;
}

export function getSearchOrderBy(matchQuery: string) {
  const rank = getSearchRankExpression(matchQuery);

  return [asc(rank), desc(note.createdAt), asc(note.id)];
}
