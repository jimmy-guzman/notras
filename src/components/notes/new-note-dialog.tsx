"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export function NewNoteDialog({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      onOpenChange={() => {
        router.back();
      }}
      open
    >
      <DialogContent>
        <DialogTitle>New Note</DialogTitle>
        <DialogDescription>Create a new note below.</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
