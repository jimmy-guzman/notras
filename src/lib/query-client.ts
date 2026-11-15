import { QueryCache, QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";

async function retryFailedQueries(client: QueryClient, what: string) {
  // Explicit retry includes queries disabled since the failure.
  // The cache reports any new failures through the same toast.
  await Promise.allSettled(
    client
      .getQueryCache()
      .findAll({
        predicate: (failed) =>
          failed.meta?.what === what && failed.state.status === "error",
      })
      .map(
        async (failed) => await failed.fetch(undefined, { cancelRefetch: true })
      )
  );
}

/**
 * The watcher decides staleness; a failed read surfaces at once. The cache
 * speaks only for a refetch of data already on screen, which would otherwise
 * keep rendering in silence; a first read has a surface of its own. Each
 * query's `meta.what` says whether it speaks, and in what words, and the toast
 * offers to read again.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        const what = query.meta?.what;

        if (what !== undefined && query.state.data !== undefined) {
          const reason = reasonOf(error);
          // Several queries share a title, the note list's for one, so one
          // failure keeps one toast: Base UI updates a toast by its id.
          const id = `${what} ${reason}`;

          toast.add({
            actionProps: {
              children: "retry",
              onClick: () => {
                toast.close(id);
                void retryFailedQueries(client, what);
              },
            },
            description: reason,
            id,
            title: what,
            type: "error",
          });
        }
      },
    }),
  });

  return client;
}
