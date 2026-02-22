import { Skeleton } from "@/components/ui/skeleton";

export default function EditNoteLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      <div className="mb-6">
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 w-full rounded-md" />
        <div className="flex justify-end gap-2 pt-4">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}
