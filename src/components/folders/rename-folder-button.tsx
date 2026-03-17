"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { Schema } from "effect";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { renameFolderSchema } from "@/server/schemas/folder-schemas";

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

  const form = useForm({
    defaultValues: { folderId, name: currentName },
    mode: "onSubmit",
    resolver: standardSchemaResolver(
      Schema.standardSchemaV1(renameFolderSchema),
    ),
  });

  const action = useServerAction(renameFolder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("folder renamed");
        form.reset({ folderId, name: currentName });
        setOpen(false);
      }),
      onErrorDeferred(() => {
        toast.error("failed to rename folder. please try again.");
      }),
    ],
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset({ folderId, name: currentName });
    }
  }

  const handleSubmit = form.handleSubmit(async (data) => {
    await action.execute(data);
  });

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
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6 py-4">
            <Field
              data-invalid={Boolean(form.formState.errors.name) || undefined}
            >
              <FieldLabel htmlFor="folder-name">name</FieldLabel>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- this is intentional to focus the input when the dialog opens
                autoFocus
                id="folder-name"
                placeholder="folder name"
                {...form.register("name")}
              />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
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
            <Button disabled={action.isPending} type="submit">
              {action.isPending ? "saving..." : "save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
