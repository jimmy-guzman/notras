"use server";

import {
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { and, desc, eq, gte, isNull, like } from "drizzle-orm";
import invariant from "tiny-invariant";

import type { Kind } from "@/lib/kind";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

type TimeFilter = "month" | "today" | "week" | "year" | "yesterday";

interface Options {
  kind?: Kind;
  query?: string;
  time?: "all" | TimeFilter;
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

export async function getNotes({ kind, query, time = "all" }: Options) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  return db
    .select()
    .from(note)
    .where(
      and(
        eq(note.userId, session.user.id),
        isNull(note.deletedAt),
        kind ? eq(note.kind, kind) : undefined,
        query ? like(note.content, `%${query}%`) : undefined,
        time === "all"
          ? undefined
          : gte(note.createdAt, getStartDateForFilter(time)),
      ),
    )
    .orderBy(desc(note.pinnedAt), desc(note.createdAt));
}
