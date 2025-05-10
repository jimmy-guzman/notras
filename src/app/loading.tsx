import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mt-4 flex flex-col gap-12 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-2">
        <div className="flex justify-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => {
            // eslint-disable-next-line @eslint-react/no-array-index-key -- this is okay
            return <Skeleton className="h-8 w-16 rounded-md" key={i} />;
          })}
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-6">
        {Array.from({ length: 2 }).map((_, i) => {
          return (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- this is okay
            <div key={i}>
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
          );
        })}
      </div>
    </section>
  );
}
