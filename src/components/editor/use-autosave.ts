import { useCallback, useEffect, useRef, useState } from "react";

import { registerPendingFlush } from "@/lib/pending-flush";

export type SaveStatus = "dirty" | "failed" | "saved" | "saving";

const AUTOSAVE_DELAY_MS = 800;

interface AutosaveOptions {
  /**
   * Whether this buffer may reach disk. False while the file is gone, so a
   * write cannot recreate what someone deleted.
   *
   * Derived by the caller rather than latched here, because the old latch
   * could not be undone: one failed read stopped a tab writing for the rest of
   * the session, and the banner explaining it cleared on the next read that
   * worked.
   */
  enabled: boolean;
  /** Called with the file's new mtime after every successful save. */
  onSaved: (updatedAt: Date) => void;
  /** How this buffer reaches disk: a note and an external file differ here and nowhere else (`D54`). */
  write: (path: string, content: string) => Promise<Date>;
}

/**
 * Debounced autosave for one buffer, flushed on window blur and unmount so
 * nothing is ever left unsaved.
 */
export function useAutosave(path: string, options: AutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pendingRef = useRef<null | string>(null);
  const inFlightRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pathRef = useRef(path);
  const optionsRef = useRef(options);

  useEffect(() => {
    pathRef.current = path;
    optionsRef.current = options;
  });

  // Resolves to whether quitting would lose anything: true when there was
  // nothing to write, the write landed, or writing is off because the file has
  // gone. False only on a failed write.
  const writeOnce = useCallback(async () => {
    clearTimeout(timerRef.current);
    const content = pendingRef.current;

    if (content === null) {
      return true;
    }

    // The one gate on reaching disk, deliberately not also in `onChange`:
    // recording has to continue, or a later flush would send the snapshot from
    // before the file went, over the top of everything typed since. Reported
    // as safe because a quit that reported otherwise could never complete.
    if (!optionsRef.current.enabled) {
      return true;
    }

    pendingRef.current = null;
    setStatus("saving");

    try {
      const updatedAt = await optionsRef.current.write(
        pathRef.current,
        content
      );

      optionsRef.current.onSaved(updatedAt);
      // A keystroke may have landed while the write was in flight.
      refreshStatus();

      return true;
    } catch {
      // A keystroke may have landed while the failing write was in flight, and
      // that buffer is newer than the snapshot this call started from.
      pendingRef.current ??= content;
      setStatus("failed");

      return false;
    }

    function refreshStatus() {
      setStatus(pendingRef.current === null ? "saved" : "dirty");
    }
  }, []);

  /**
   * Flush the buffer, resolving to whether nothing is left unsaved.
   *
   * Saves are serialized on one chain. The debounce timer, the blur handler
   * and the unmount cleanup can all fire while a write is in flight, and two
   * overlapping writes could land out of order -- an older buffer last.
   */
  const flush = useCallback(() => {
    const next = inFlightRef.current.then(writeOnce, writeOnce);

    inFlightRef.current = next;

    return next;
  }, [writeOnce]);

  const onChange = useCallback(
    (content: string) => {
      pendingRef.current = content;
      setStatus("dirty");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush]
  );

  // Leaving the note (or the app) flushes any pending write.
  useEffect(() => {
    const handleWindowBlur = () => {
      if (pendingRef.current !== null) {
        flush();
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    const unregister = registerPendingFlush(flush);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      unregister();
      if (pendingRef.current !== null) {
        flush();
      }
    };
  }, [flush]);

  return { flush, onChange, status };
}
