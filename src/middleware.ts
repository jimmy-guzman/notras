import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/notes", "/archives"],
  runtime: "nodejs",
};
