"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { clearReminder } from "@/actions/clear-reminder";
import { getDueReminders } from "@/actions/get-due-reminders";
import { toNoteId } from "@/lib/id";
import { truncate } from "@/lib/utils/truncate";

const MAX_PREVIEW_LENGTH = 60;
const checkedPaths = new Set<string>();

export function ReminderChecker() {
  const pathname = usePathname();

  useEffect(() => {
    if (checkedPaths.has(pathname)) {
      return;
    }

    checkedPaths.add(pathname);

    async function checkReminders() {
      const dueNotes = await getDueReminders();

      for (const note of dueNotes) {
        const noteId = toNoteId(note.id);
        const preview = truncate(note.content, MAX_PREVIEW_LENGTH);

        toast.info(preview, {
          action: {
            label: "view",
            onClick: () => {
              globalThis.location.href = `/notes/${noteId}`;
            },
          },
          duration: Infinity,
          onDismiss: () => {
            void clearReminder(noteId);
          },
        });
      }
    }

    void checkReminders();
  }, [pathname]);

  return null;
}
