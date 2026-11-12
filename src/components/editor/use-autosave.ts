import { useSelector } from "@tanstack/react-store";
import { useEffect } from "react";

import { registerPendingFlush } from "@/lib/pending-flush";

import type { NotePersistence } from "./note-persistence";

export type { SaveStatus } from "./note-persistence";

async function releaseThenUnregister(
  release: () => Promise<void>,
  unregister: () => void
) {
  try {
    await release();
  } finally {
    unregister();
  }
}

/** Register the session's flush with pending-flush and hold the session until it settles. */
export function useAutosave(persistence: NotePersistence) {
  const state = useSelector(persistence.store);
  useEffect(() => {
    const release = persistence.retain();

    const unregister = registerPendingFlush(
      async () => await persistence.flush()
    );

    return () => {
      void releaseThenUnregister(release, unregister);
    };
  }, [persistence]);

  return {
    ...state,
    changePath: persistence.changePath,
    flush: persistence.flush,
    onChange: persistence.edit,
    onHistory: persistence.applyHistory,
  };
}
