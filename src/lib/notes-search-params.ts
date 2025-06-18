import type { inferParserType } from "nuqs/server";

import { parseAsString, parseAsStringEnum } from "nuqs/server";

import { KIND_VALUES } from "@/lib/kind";

export const parsers = {
  kind: parseAsStringEnum([...KIND_VALUES, "all"]).withDefault("all"),
  q: parseAsString.withDefault(""),
  sort: parseAsStringEnum(["newest", "oldest", "updated"]).withDefault(
    "newest",
  ),
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
