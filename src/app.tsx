import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { CaptureWindow } from "@/components/capture-window";
import { Toaster, toast } from "@/components/ui/toast";
import { Layout } from "@/layout";
import { reasonOf } from "@/lib/ui/failure";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";
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

      if (what !== undefined && query.state.data !== undefined) {
        toast.add({ description: reasonOf(error), title: what, type: "error" });
      }
    },
  }),
});

const isCaptureWindow = new URLSearchParams(globalThis.location.search).has(
  "window"
);

export function App() {
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- the cleanup below stops the listener once its promise settles
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
      <Layout />
      <Toaster />
    </QueryClientProvider>
  );
}
