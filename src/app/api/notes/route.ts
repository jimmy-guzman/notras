import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getNotes, getNotesCount, loadSearchParams } from "@/actions/get-notes";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const [notes, totalCount] = await Promise.all([
      getNotes(loadSearchParams(searchParams)),
      getNotesCount(),
    ]);

    return NextResponse.json({
      notes,
      total: notes.length,
      totalCount,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch notes", notes: [], total: 0, totalCount: 0 },
      { status: 500 },
    );
  }
}
