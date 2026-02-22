"use client";

import type { ReactNode } from "react";

import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface EditFormHotkeysProps {
  action: (formData: FormData) => void;
  children: ReactNode;
  noteId: string;
}

export function EditFormHotkeys({
  action,
  children,
  noteId,
}: EditFormHotkeysProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const el = formRef.current?.querySelector<HTMLElement>("[data-autofocus]");

    el?.focus();
  }, []);

  useHotkeys(
    "mod+enter",
    () => {
      formRef.current?.requestSubmit();
    },
    { enableOnFormTags: ["TEXTAREA"] },
  );

  useHotkeys(
    "escape",
    () => {
      globalThis.location.href = `/notes/${noteId}`;
    },
    { enableOnFormTags: ["TEXTAREA"] },
  );

  return (
    <form action={action} className="flex flex-col gap-6" ref={formRef}>
      {children}
    </form>
  );
}
