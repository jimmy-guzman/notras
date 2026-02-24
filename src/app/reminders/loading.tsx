import { Skeleton } from "@/components/ui/skeleton";

function ReminderItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-4 min-w-0 flex-1" />
      <Skeleton className="h-3 w-24 shrink-0" />
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col divide-y">
        {Array.from({ length: 3 }, (_, i) => {
          return <ReminderItemSkeleton key={i} />;
        })}
      </div>
    </div>
  );
}

export default function RemindersLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  );
}
