"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { truncate } from "@/lib/utils/truncate";

const MAX_PREVIEW_LENGTH = 60;

interface ReminderEvent {
  content: string;
  noteId: string;
}

interface RemindersContextValue {
  decrement: () => void;
  overdueCount: number;
}

const RemindersContext = createContext<null | RemindersContextValue>(null);

RemindersContext.displayName = "RemindersContext";

export function useReminders() {
  const context = use(RemindersContext);

  if (!context) {
    throw new Error("useReminders must be used within a RemindersProvider");
  }

  return context;
}

interface RemindersProviderProps {
  children: ReactNode;
  initialCount: number;
}

export function RemindersProvider({
  children,
  initialCount,
}: RemindersProviderProps) {
  const [overdueCount, setOverdueCount] = useState(initialCount);
  const router = useRouter();

  const decrement = useCallback(() => {
    setOverdueCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/reminders/stream");

    function handleMessage(event: MessageEvent<string>) {
      const { content, noteId } = JSON.parse(event.data) as ReminderEvent;
      const preview = truncate(content, MAX_PREVIEW_LENGTH);

      setOverdueCount((prev) => prev + 1);

      toast.info(preview, {
        action: {
          label: "view",
          onClick: () => {
            router.push(`/notes/${noteId}`);
          },
        },
        duration: 5000,
      });
    }

    source.addEventListener("message", handleMessage);

    return () => {
      source.removeEventListener("message", handleMessage);
      source.close();
    };
  }, [router]);

  const value = useMemo(
    () => ({ decrement, overdueCount }),
    [decrement, overdueCount],
  );

  return <RemindersContext value={value}>{children}</RemindersContext>;
}
