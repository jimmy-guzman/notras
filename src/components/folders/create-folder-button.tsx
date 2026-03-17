"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { Schema } from "effect";
import { FolderPlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
import { createFolderSchema } from "@/server/schemas/folder-schemas";

export function CreateFolderButton() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const action = useServerAction(createFolder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("folder created");
        setOpen(false);
      }),
      onErrorDeferred(() => {
        toast.error("failed to create folder. please try again.");
      }),
    ],
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
    if (nextOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      form.reset();
    }
  }

  const handleSubmit = form.handleSubmit(async (data) => {
    await action.execute(data);
  });

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
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6 py-4">
            <Field
              data-invalid={Boolean(form.formState.errors.name) || undefined}
            >
              <FieldLabel htmlFor="folder-name">name</FieldLabel>
              <Input
                id="folder-name"
                placeholder="folder name"
                {...form.register("name")}
                ref={(el) => {
                  form.register("name").ref(el);
                  inputRef.current = el;
                }}
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
              {action.isPending ? "creating..." : "create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
