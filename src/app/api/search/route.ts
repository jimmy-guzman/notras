// app/api/search/route.ts
import type { NextRequest } from "next/server";

import type { Kind } from "@/lib/kind";

import { getNotes } from "@/actions/get-notes"; // or wherever your function is

function parseSearchQuery(query: string) {
  const trimmedQuery = query.trim().toLowerCase();

  // Handle "kind dream" type queries
  const kindMatch = /^kind\s+(.+)/.exec(trimmedQuery);

  if (kindMatch) {
    return { kind: kindMatch[1] as Kind };
  }

  // Handle time filters
  if (["month", "today", "week", "year", "yesterday"].includes(trimmedQuery)) {
    return {
      time: trimmedQuery as "month" | "today" | "week" | "year" | "yesterday",
    };
  }

  // Default to content search
  return { query: trimmedQuery };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get("q");

    if (!query) {
      return Response.json({ notes: [] });
    }

    // Parse the query to extract filters
    const filters = parseSearchQuery(query);

    const notes = await getNotes(filters);

    return Response.json({ notes });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
