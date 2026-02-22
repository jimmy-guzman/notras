"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface FormHotkeysProps {
  action: (formData: FormData) => void;
  cancelHref: string;
  children: ReactNode;
}

export function FormHotkeys({
  action,
  cancelHref,
  children,
}: FormHotkeysProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

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
      router.push(cancelHref);
    },
    { enableOnFormTags: ["TEXTAREA"] },
  );

  return (
    <form action={action} className="flex flex-col gap-6" ref={formRef}>
      {children}
    </form>
  );
}
