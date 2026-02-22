import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <section className="flex w-full flex-1 flex-col items-center">
      <header className="flex flex-1 flex-col items-center justify-center pt-20 pb-4 text-center md:pb-8 lg:pb-20">
        <Skeleton className="mb-2 h-12 w-48 sm:h-16" />
        <Skeleton className="mb-12 h-5 w-80 sm:h-6" />
        <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
        <div className="mt-4">
          <Skeleton className="h-5 w-28" />
        </div>
      </header>

      <nav className="w-full px-4 pt-4 pb-16">
        <div className="mx-auto max-w-xl">
          <Skeleton className="mb-3 h-4 w-28" />
          {Array.from({ length: 5 }, (_, i) => {
            return (
              <div key={i}>
                {i > 0 && <Separator />}
                <div className="py-2">
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            );
          })}
          <Separator />
          <div className="flex justify-center pt-2">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </nav>
    </section>
  );
}
