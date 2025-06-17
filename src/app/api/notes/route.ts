import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import type { Kind } from "@/lib/kind";

import { getNotes, getNotesCount } from "@/actions/get-notes";

type TimeFilter = "month" | "today" | "week" | "year" | "yesterday";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and validate query parameters
    const kind = searchParams.get("kind") as "all" | Kind | null;
    const time = searchParams.get("time") as "all" | TimeFilter;
    const query =
      searchParams.get("query") ?? searchParams.get("q") ?? undefined;
    const sort = searchParams.get("sort") ?? "newest";

    // Build filters object for getNotes
    const filters: {
      kind?: Kind;
      query?: string;
      sort?: "newest" | "oldest" | "updated";
      time?: TimeFilter;
    } = {};

    // Add optional filters (undefined means "all")
    if (kind && kind !== "all") {
      filters.kind = kind;
    }

    if (time !== "all") {
      filters.time = time;
    }

    if (query) {
      filters.query = query;
    }

    // Add sort parameter with validation
    if (sort && ["newest", "oldest", "updated"].includes(sort)) {
      filters.sort = sort as "newest" | "oldest" | "updated";
    }

    // Get notes and count
    const [notes, totalCount] = await Promise.all([
      getNotes(filters),
      getNotesCount(),
    ]);

    // Calculate pagination info (for future infinite scroll)
    const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    const hasMore = notes.length > offset + limit;

    // Apply client-side pagination if needed
    let paginatedNotes = notes;

    if (limit && offset) {
      paginatedNotes = notes.slice(offset, offset + limit);
    } else if (limit) {
      paginatedNotes = notes.slice(0, limit);
    }

    return NextResponse.json({
      filters: {
        kind: filters.kind ?? null,
        limit,
        offset,
        query: filters.query ?? null,
        sort: filters.sort ?? "newest",
        time: filters.time ?? null,
      },
      hasMore,
      notes: paginatedNotes,
      total: notes.length, // Filtered count
      totalCount, // Total notes count for user
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to fetch notes",
        hasMore: false,
        notes: [],
        total: 0,
        totalCount: 0,
      },
      { status: 500 },
    );
  }
}
