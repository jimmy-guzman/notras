import { useCallback, useEffect, useRef, useState } from "react";

import { formatNote } from "@/data/format-note";
import { saveNote } from "@/data/save-note";

export type SaveStatus = "dirty" | "saved" | "saving";

const AUTOSAVE_DELAY_MS = 800;

interface AutosaveOptions {
  /** Called with the file's new mtime after every successful save. */
  onSaved?: (updatedAt: Date) => void;
}

/**
 * Debounced autosave for one note buffer. Formatting runs when the note is
 * left (unmount or window blur), never mid-keystroke -- the formatted file
 * flows back in through the notes-changed reload path.
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

  const saveAndFormat = useCallback(async () => {
    const notePath = pathRef.current;

    await flush();
    // Fire-and-forget: the watcher/reload path picks up the result.
    void formatNote(notePath).catch(() => {
      return undefined;
    });
  }, [flush]);

  // Leaving the note (or the app) saves and formats.
  useEffect(() => {
    const handleWindowBlur = () => {
      if (pendingRef.current !== null) {
        void saveAndFormat();
      }
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      if (pendingRef.current !== null) {
        void saveAndFormat();
      }
    };
  }, [saveAndFormat]);

  return { flush, onChange, status };
}
