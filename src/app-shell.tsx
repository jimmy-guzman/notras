import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import { CaptureWindow } from "@/components/capture-window";
import { Toaster, toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";
import { routeTree } from "@/routeTree.gen";
import { events } from "@/server/adapters/bindings";

/**
 * The watcher decides staleness; a failed read surfaces at once. The cache
 * speaks only for a refetch of data already on screen, which would otherwise
 * keep rendering in silence; a first read has a surface of its own. Each
 * query's `meta.what` says whether it speaks, and in what words.
 */
const queryClient = new QueryClient({
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

      if (typeof what === "string" && query.state.data !== undefined) {
        toast.add({ description: reasonOf(error), title: what, type: "error" });
      }
    },
  }),
});

const router = createRouter({
  context: { queryClient },
  defaultPreload: "intent",
  // One cache owns staleness.
  defaultPreloadStaleTime: 0,
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const isCaptureWindow = new URLSearchParams(globalThis.location.search).has(
  "window"
);

export function App() {
  useEffect(() => {
    if (isCaptureWindow) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const subscribe = async () => {
      try {
        const stop = await events.mutationWarnings.listen(({ payload }) =>
          reportNoteWarnings(payload.warnings)
        );
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch (error) {
        toast.add({
          description: reasonOf(error),
          title: "could not receive file warnings",
          type: "error",
        });
      }
    };
    subscribe();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (isCaptureWindow) {
    return <CaptureWindow />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
