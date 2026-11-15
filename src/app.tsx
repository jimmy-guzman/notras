import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import { CaptureWindow } from "@/components/capture-window";
import { Toaster, toast } from "@/components/ui/toast";
import { createQueryClient } from "@/lib/query-client";
import { reasonOf } from "@/lib/ui/failure";
import { reportNoteWarnings } from "@/lib/ui/note-warnings";
import { events } from "@/server/adapters/bindings";

import { Layout } from "./layout";

const queryClient = createQueryClient();

const isCaptureWindow = new URLSearchParams(globalThis.location.search).has(
  "window"
);

function listenForWarnings() {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  const subscribe = async () => {
    try {
      const stop = await events.mutationWarnings.listen(({ payload }) => {
        reportNoteWarnings(payload.warnings);
      });

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

  void subscribe();

  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function App() {
  useEffect(() => (isCaptureWindow ? undefined : listenForWarnings()), []);

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
