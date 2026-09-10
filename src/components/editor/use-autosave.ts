import { useDebouncer } from "@tanstack/react-pacer";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect } from "react";
import type {
  EditorContent,
  NotePersistence,
  PathChange,
} from "@/components/editor/note-persistence";
import { registerPendingFlush } from "@/lib/pending-flush";
import type { DocumentEdit } from "./note-document";

export type { SaveStatus } from "@/components/editor/note-persistence";

/** React owns the debounce and lifecycle; the controller owns persistence. */
export function useAutosave(persistence: NotePersistence) {
  const state = useSelector(persistence.store);
  const { cancel, maybeExecute: schedule } = useDebouncer(persistence.save, {
    wait: 800,
  });
  const onChange = useCallback(
    (content: EditorContent, edit?: DocumentEdit) => {
      persistence.edit(content, edit);
      schedule();
    },
    [persistence, schedule]
  );
  const flush = useCallback(async () => {
    cancel();
    return await persistence.flush();
  }, [cancel, persistence]);
  const changePath = useCallback(
    async (change: PathChange) => {
      cancel();
      try {
        await persistence.changePath(change);
      } finally {
        if (persistence.store.state.status === "dirty") {
          schedule();
        }
      }
    },
    [cancel, persistence, schedule]
  );

  useEffect(() => {
    const blur = () => {
      flush();
    };
    window.addEventListener("blur", blur);
    const unregister = registerPendingFlush(flush);
    return () => {
      window.removeEventListener("blur", blur);
      const finish = async () => {
        try {
          await flush();
        } finally {
          unregister();
        }
      };
      finish();
    };
  }, [flush]);

  const onHistory = useCallback(
    (direction: "undo" | "redo", execute: boolean) => {
      const applied = persistence.applyHistory(direction, execute);
      if (execute && applied) {
        schedule();
      }
      return applied;
    },
    [persistence, schedule]
  );
  return { ...state, changePath, flush, onChange, onHistory };
}
