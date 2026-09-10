import { useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import type { NotePersistence } from "@/components/editor/note-persistence";
import { registerPendingFlush } from "@/lib/pending-flush";

export type { SaveStatus } from "@/components/editor/note-persistence";

/** Bind window lifecycle to the session; editing and scheduling live in the session. */
export function useAutosave(persistence: NotePersistence) {
  const state = useSelector(persistence.store);
  useEffect(() => {
    const release = persistence.retain();
    const flush = async () => await persistence.flush();
    const blur = () => {
      flush();
    };
    window.addEventListener("blur", blur);
    const unregister = registerPendingFlush(flush);
    return () => {
      window.removeEventListener("blur", blur);
      const finish = async () => {
        try {
          await release();
        } finally {
          unregister();
        }
      };
      finish();
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
