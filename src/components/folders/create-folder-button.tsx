"use client";

import { FolderPlusIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createFolder } from "@/actions/create-folder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CreateFolderButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createFolder(formData);
        setOpen(false);
        toast.success("folder created");
      } catch {
        toast.error("failed to create folder. please try again.");
      }
    });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <button
          className="flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/50"
          type="button"
        >
          <FolderPlusIcon className="size-4" />
          <span className="sr-only">new folder</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>new folder</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit}>
          <div className="flex flex-col gap-6 py-4">
            <Field>
              <FieldLabel htmlFor="folder-name">name</FieldLabel>
              <Input
                id="folder-name"
                name="name"
                placeholder="folder name"
                ref={inputRef}
                required
              />
              <FieldError />
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false);
              }}
              type="button"
              variant="outline"
            >
              cancel
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "creating..." : "create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
