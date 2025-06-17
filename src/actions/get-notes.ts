"use server";

import {
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { and, asc, count, desc, eq, gte, isNull, like, or } from "drizzle-orm";
import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import type { Kind } from "@/lib/kind";

import { authorizedServerAction } from "@/lib/authorized";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

type TimeFilter = "month" | "today" | "week" | "year" | "yesterday";
type SortOption = "newest" | "oldest" | "updated";

interface Filters {
  kind?: Kind;
  query?: string;
  sort?: SortOption;
  time?: TimeFilter; // Remove "all" since undefined = all
}

function getStartDateForFilter(time: TimeFilter): Date {
  const now = new Date();

  if (time === "month") {
    return startOfMonth(now);
  }

  if (time === "week") {
    return startOfWeek(now);
  }

  if (time === "year") {
    return startOfYear(now);
  }

  if (time === "yesterday") {
    return startOfDay(subDays(now, 1));
  }

  return startOfDay(now);
}

function getSortOrder(sort: SortOption = "newest") {
  // Always prioritize pinned notes first, then apply the requested sort
  switch (sort) {
    case "oldest": {
      return [desc(note.pinnedAt), asc(note.createdAt)];
    }
    case "updated": {
      return [desc(note.pinnedAt), desc(note.updatedAt)];
    }
    default: {
      return [desc(note.pinnedAt), desc(note.createdAt)];
    }
  }
}

export async function getNotes({
  kind,
  query,
  sort = "newest",
  time,
}: Filters) {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const baseFilters = [eq(note.userId, userId), isNull(note.deletedAt)];

    const kindFilter =
      kind === "thought"
        ? [or(eq(note.kind, "thought"), isNull(note.kind))]
        : kind
          ? [eq(note.kind, kind)]
          : [];

    const queryFilter = query ? [like(note.content, `%${query}%`)] : [];

    const timeFilter = time
      ? [gte(note.createdAt, getStartDateForFilter(time))]
      : [];

    cacheTag("notes");

    const notes = await db
      .select()
      .from(note)
      .where(and(...baseFilters, ...kindFilter, ...queryFilter, ...timeFilter))
      .orderBy(...getSortOrder(sort));

    return notes;
  });
}

export async function getNotesCount() {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const [{ count: notesCount }] = await db
      .select({ count: count() })
      .from(note)
      .where(and(eq(note.userId, userId), isNull(note.deletedAt)));

    cacheTag("notes count");

    return notesCount;
  });
}
