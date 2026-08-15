import { useCallback, useEffect, useRef, useState } from "react";

import { saveNote } from "@/data/save-note";

export type SaveStatus = "dirty" | "saved" | "saving";

const AUTOSAVE_DELAY_MS = 800;

interface AutosaveOptions {
  /** Called with the file's new mtime after every successful save. */
  onSaved?: (updatedAt: Date) => void;
}

/**
 * Debounced autosave for one note buffer, flushed on window blur and
 * unmount so nothing is ever left unsaved.
 */
export function useAutosave(path: string, options?: AutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pendingRef = useRef<null | string>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pathRef = useRef(path);
  const onSavedRef = useRef(options?.onSaved);

  useEffect(() => {
    pathRef.current = path;
    onSavedRef.current = options?.onSaved;
  });

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const content = pendingRef.current;

    if (content === null) {
      return false;
    }

    pendingRef.current = null;
    setStatus("saving");

    try {
      const updatedAt = await saveNote(pathRef.current, content);

      onSavedRef.current?.(updatedAt);
      // A keystroke may have landed while the write was in flight.
      refreshStatus();

      return true;
    } catch {
      pendingRef.current = content;
      setStatus("dirty");

      return false;
    }

    function refreshStatus() {
      setStatus(pendingRef.current === null ? "saved" : "dirty");
    }
  }, []);

  const onChange = useCallback(
    (content: string) => {
      pendingRef.current = content;
      setStatus("dirty");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the note (or the app) flushes any pending write.
  useEffect(() => {
    const handleWindowBlur = () => {
      if (pendingRef.current !== null) {
        void flush();
      }
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      if (pendingRef.current !== null) {
        void flush();
      }
    };
  }, [flush]);

  return { flush, onChange, status };
}
