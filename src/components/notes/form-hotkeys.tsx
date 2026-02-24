"use client";

import type { ReactNode } from "react";

import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface FormHotkeysProps {
  action: (formData: FormData) => void;
  children: ReactNode;
}

export function FormHotkeys({ action, children }: FormHotkeysProps) {
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

  return (
    <form action={action} className="flex flex-col gap-6" ref={formRef}>
      {children}
    </form>
  );
}
