"use server";

import {
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { and, asc, count, desc, eq, gte, ilike, isNull } from "drizzle-orm";
import { cacheTag } from "next/dist/server/use-cache/cache-tag";
import { createLoader } from "nuqs/server";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { authorizedServerAction } from "@/lib/authorized";
import { parsers } from "@/lib/notes-search-params";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

type SortOption = "newest" | "oldest" | "updated";
type TimeFilter = "month" | "today" | "week" | "year" | "yesterday";

export const loadSearchParams = createLoader(parsers);

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
  switch (sort) {
    case "newest": {
      return [asc(isNull(note.pinnedAt)), desc(note.createdAt)];
    }
    case "oldest": {
      return [asc(isNull(note.pinnedAt)), asc(note.createdAt)];
    }
    case "updated": {
      return [asc(isNull(note.pinnedAt)), desc(note.updatedAt)];
    }
    default: {
      return [asc(isNull(note.pinnedAt)), desc(note.createdAt)];
    }
  }
}

export async function getNotes(searchParams: NoteSearchParams) {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const { q: query, sort, time } = searchParams;

    const baseFilters = [eq(note.userId, userId), isNull(note.deletedAt)];

    const queryFilter = query ? [ilike(note.content, `%${query}%`)] : [];

    const timeFilter =
      time === "all" ? [] : [gte(note.createdAt, getStartDateForFilter(time))];

    cacheTag("notes");

    const notes = await db
      .select()
      .from(note)
      .where(and(...baseFilters, ...queryFilter, ...timeFilter))
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
