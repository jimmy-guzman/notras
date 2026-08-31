import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { CaptureWindow } from "@/components/capture-window";
import { routeTree } from "@/routeTree.gen";

/** The watcher decides staleness; a failed read surfaces at once. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
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
