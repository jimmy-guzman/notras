"use client";

import type { ReactNode } from "react";

import { DialogTitle } from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";

export function EditNoteDialog({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      onOpenChange={() => {
        router.back();
      }}
      open
    >
      <DialogContent>
        <DialogTitle>Edit Note</DialogTitle>
        <DialogDescription>
          Make changes to your note content below.
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
