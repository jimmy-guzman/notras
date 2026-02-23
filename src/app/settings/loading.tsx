import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-20" />
      </div>

      <Skeleton className="mb-6 h-8 w-32" />

      <Skeleton className="mb-4 h-6 w-16" />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-9 w-full" />
        </div>

        <div className="flex justify-end pt-4">
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </div>
  );
}
