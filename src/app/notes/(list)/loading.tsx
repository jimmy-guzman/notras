import { cookies } from "next/headers";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_VIEW, NOTES_VIEW_COOKIE_NAME } from "@/lib/view-preference";

function NoteCardSkeleton() {
  return (
    <Card className="relative flex flex-col">
      <CardContent className="flex-1 py-4">
        <Skeleton className="h-5 w-4/5" />
      </CardContent>
      <CardFooter className="border-t">
        <Skeleton className="h-3 w-24" />
      </CardFooter>
    </Card>
  );
}

function NoteListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-4 min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </div>
  );
}

export default async function NotesLoading() {
  const cookieStore = await cookies();
  const viewCookie = cookieStore.get(NOTES_VIEW_COOKIE_NAME)?.value;
  const view =
    viewCookie === "grid" || viewCookie === "list" ? viewCookie : DEFAULT_VIEW;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <div className="flex w-full flex-row gap-2 sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0 rounded-md sm:w-28" />
        </div>

        {view === "list" ? (
          <div className="flex flex-col divide-y">
            {Array.from({ length: 6 }, (_, i) => {
              return <NoteListItemSkeleton key={i} />;
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => {
              return <NoteCardSkeleton key={i} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
