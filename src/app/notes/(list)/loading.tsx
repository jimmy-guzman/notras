import { Skeleton } from "@/components/ui/skeleton";

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

export default function NotesLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <div className="flex w-full flex-row gap-2 sm:items-center">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </div>

        <div className="flex flex-col divide-y">
          {Array.from({ length: 6 }, (_, i) => {
            return <NoteListItemSkeleton key={i} />;
          })}
        </div>
      </div>
    </div>
  );
}
