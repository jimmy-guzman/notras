"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Schema } from "effect";
import { FolderPlusIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
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
import { Kbd } from "@/components/ui/kbd";
import { createFolderSchema } from "@/server/schemas/folder-schemas";

export function CreateFolderButton() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const action = useAction(createFolder, {
    onError: () => {
      toast.error("failed to create folder. please try again.");
    },
    onSuccess: () => {
      handleOpenChange(false);
    },
  });

  const form = useForm({
    defaultValues: { name: "" },
    mode: "onSubmit",
    resolver: standardSchemaResolver(
      Schema.standardSchemaV1(createFolderSchema),
    ),
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset();
    }
  }

  const handleSubmit = form.handleSubmit(async (data) => {
    await action.executeAsync(data);
  });

  useHotkeys(
    "mod+enter",
    () => {
      if (action.isPending) return;

      formRef.current?.requestSubmit();
    },
    { enabled: open, enableOnFormTags: ["INPUT"] },
  );

  useHotkeys(
    "escape",
    () => {
      handleOpenChange(false);
    },
    { enabled: open, enableOnFormTags: ["INPUT"] },
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          className="h-auto rounded-full px-3 py-1.5"
          type="button"
          variant="outline"
        >
          <FolderPlusIcon className="size-4" />
          <span className="sr-only">new folder</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>new folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} ref={formRef}>
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
                handleOpenChange(false);
              }}
              type="button"
              variant="outline"
            >
              cancel
            </Button>
            <Button disabled={action.isPending} type="submit">
              {action.isPending ? (
                "creating..."
              ) : (
                <>
                  create <Kbd>⌘</Kbd>
                  <Kbd>⏎</Kbd>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
