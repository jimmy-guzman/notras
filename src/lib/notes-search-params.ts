import type { inferParserType } from "nuqs/server";

import { parseAsString, parseAsStringEnum } from "nuqs/server";

export const parsers = {
  folder: parseAsString.withDefault(""),
  q: parseAsString.withDefault(""),
  sort: parseAsStringEnum(["newest", "oldest", "updated"]).withDefault(
    "newest",
  ),
  tag: parseAsString.withDefault(""),
  time: parseAsStringEnum([
    "month",
    "today",
    "week",
    "year",
    "yesterday",
    "all",
  ]).withDefault("all"),
};

export type NoteSearchParams = inferParserType<typeof parsers>;
