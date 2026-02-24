"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { truncate } from "@/lib/utils/truncate";

const MAX_PREVIEW_LENGTH = 60;

interface ReminderEvent {
  content: string;
  noteId: string;
}

export function ReminderChecker() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/reminders/stream");

    function handleMessage(event: MessageEvent<string>) {
      const { content, noteId } = JSON.parse(event.data) as ReminderEvent;
      const preview = truncate(content, MAX_PREVIEW_LENGTH);

      toast.info(preview, {
        action: {
          label: "view",
          onClick: () => {
            router.push(`/notes/${noteId}`);
          },
        },
        duration: Infinity,
      });
    }

    source.addEventListener("message", handleMessage);

    return () => {
      source.removeEventListener("message", handleMessage);
      source.close();
    };
  }, [router]);

  return null;
}
