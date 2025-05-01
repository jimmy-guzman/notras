import Link from "next/link";
import { Suspense } from "react";

import type { Kind } from "@/lib/kind";

import { NewNoteInput } from "@/components/new-note-input";
import { NotesList } from "@/components/notes-list";
import { NotesSearchInput } from "@/components/notes-search";
import { getSession } from "@/lib/auth";

interface PageProps {
  searchParams: Promise<{
    kind?: Kind;
    mode?: string;
    q?: string;
  }>;
}

export default async function Page(props: PageProps) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  const query = searchParams.q ?? "";
  const { kind } = searchParams;
  const mode = searchParams.mode === "search" ? "search" : "create";

  return (
    <section className="mt-4 flex flex-col gap-8 p-4">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to notras{" "}
          <span className="bg-foreground bg-clip-text text-transparent">
            👋
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">
          A simple space to capture your thoughts as they come.
        </p>
      </div>

      {session?.session ? (
        <>
          {mode === "create" ? (
            <NewNoteInput />
          ) : (
            <Suspense>
              <NotesSearchInput />
            </Suspense>
          )}
          <NotesList kind={kind} query={query} />
        </>
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          <Link className="underline underline-offset-4" href="/signin">
            Sign in
          </Link>{" "}
          to start capturing your thoughts.
        </p>
      )}
    </section>
  );
}
