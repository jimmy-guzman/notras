import { Plus } from "lucide-react";
import Link from "next/link";

import { getNotes, getNotesCount } from "@/actions/get-notes";
import { SignedOutFallback } from "@/components/auth/signed-out-fallback";
import { HomeSearch } from "@/components/notes/home-search";
import { RecentNotes } from "@/components/notes/recent-notes";
import { getSession } from "@/lib/auth";

const RECENT_NOTES_LIMIT = 5;

export default async function Page() {
  const session = await getSession();

  if (!session?.session) return <SignedOutFallback />;

  const [count, recentNotes] = await Promise.all([
    getNotesCount(),
    getNotes(
      { q: "", sort: "newest", time: "all" },
      { limit: RECENT_NOTES_LIMIT },
    ),
  ]);

  const [firstName] = session.user.name.split(" ");

  return (
    <section className="flex w-full flex-1 flex-col items-center">
      <header className="flex flex-1 flex-col items-center justify-center pt-20 pb-4 text-center md:pb-8 lg:pb-20">
        <h1 className="mb-2 text-5xl font-semibold tracking-tight sm:text-7xl">
          notras
        </h1>
        <p className="text-muted-foreground mb-12 text-lg sm:text-xl">
          {count > 0 && firstName
            ? `Welcome back, ${firstName}. Ready to capture more thoughts?`
            : "A simple space to capture your thoughts as they come."}
        </p>

        {count > 0 && <HomeSearch />}

        <div className="mt-4 flex items-center gap-4">
          <Link
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm underline-offset-4 transition-colors hover:underline"
            href="/notes/new"
          >
            <Plus className="h-4 w-4" />
            New Note
          </Link>
        </div>
      </header>

      {count > 0 && (
        <nav className="w-full px-4 pt-4 pb-16">
          <div className="mx-auto max-w-xl">
            <RecentNotes notes={recentNotes} />
          </div>
        </nav>
      )}
    </section>
  );
}
