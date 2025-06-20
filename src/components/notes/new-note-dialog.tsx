"use client";

import type { ReactNode } from "react";

import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent } from "@/components/ui/dialog";

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
