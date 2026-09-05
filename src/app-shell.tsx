import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { CaptureWindow } from "@/components/capture-window";
import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";
import { routeTree } from "@/routeTree.gen";

/**
 * The watcher decides staleness; a failed read surfaces at once. A first read
 * reports through its own surface, the route error screen or the tab's pane,
 * so the cache speaks only for a refetch of data already on screen, which
 * would otherwise keep rendering the old rows in silence (`D66`). Which
 * queries it speaks for, and in what words, is the `meta.what` each carries.
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
  if (isCaptureWindow) {
    return <CaptureWindow />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
