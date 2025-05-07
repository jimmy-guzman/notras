import { Hero } from "@/components/hero";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mt-4 flex flex-col gap-12 p-4">
      <Hero />

      <div className="mx-auto w-full max-w-2xl space-y-2">
        <div className="flex justify-center gap-2">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>

        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <div className="flex items-center justify-between text-sm">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-6 w-6 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>

        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <div className="flex items-center justify-between text-sm">
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-6 w-6 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
    </section>
  );
}
