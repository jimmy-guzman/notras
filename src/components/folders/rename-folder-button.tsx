"use client";

import { PencilIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FolderId } from "@/lib/id";

import { renameFolder } from "@/actions/rename-folder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface RenameFolderButtonProps {
  currentName: string;
  folderId: FolderId;
  iconOnly?: boolean;
}

export function RenameFolderButton({
  currentName,
  folderId,
  iconOnly = false,
}: RenameFolderButtonProps) {
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
    const value = formData.get("name");

    if (typeof value !== "string" || value.trim().length === 0) {
      return;
    }

    const name = value.trim();

    startTransition(async () => {
      const [error] = await renameFolder({ folderId, name });

      if (error) {
        toast.error("failed to rename folder. please try again.");
      } else {
        setOpen(false);
        toast.success("folder renamed");
      }
    });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <PencilIcon className="h-4 w-4" />
          {iconOnly ? (
            <span className="sr-only">rename</span>
          ) : (
            <span className="sr-only sm:not-sr-only">rename</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>rename folder</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit}>
          <div className="flex flex-col gap-6 py-4">
            <Field>
              <FieldLabel htmlFor="folder-name">name</FieldLabel>
              <Input
                defaultValue={currentName}
                id="folder-name"
                name="name"
                placeholder="folder name"
                ref={inputRef}
                required
              />
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
              {isPending ? "saving..." : "save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
