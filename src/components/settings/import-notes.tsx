"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { Schema } from "effect";
import { UploadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import type { ImportMode } from "@/server/schemas/export-schemas";

import { importNotes } from "@/actions/import-notes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { importInputSchema } from "@/server/schemas/export-schemas";

export function ImportNotes() {
  const [showMirrorConfirm, setShowMirrorConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<{ file: File; mode: ImportMode }>({
    defaultValues: {
      mode: "merge",
    },
    mode: "onChange",
    resolver: standardSchemaResolver(
      Schema.standardSchemaV1(importInputSchema),
    ),
  });

  const action = useServerAction(importNotes, {
    interceptors: [
      onSuccessDeferred((result) => {
        toast.success(result.message);
      }),
      onErrorDeferred((error) => {
        toast.error(error.message);
      }),
    ],
  });

  useEffect(() => {
    if (action.isSuccess) {
      form.reset();
      action.reset();

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [action, form]);

  const executeSubmit = form.handleSubmit(async (data) => {
    await action.execute(data);
  });

  function handleSubmit(e?: React.BaseSyntheticEvent) {
    e?.preventDefault();

    const mode = form.getValues("mode");

    if (mode === "mirror") {
      void form.trigger().then((valid) => {
        if (valid) {
          setShowMirrorConfirm(true);
        }
      });

      return;
    }

    void executeSubmit(e);
  }

  function handleMirrorConfirm() {
    if (action.isPending) return;

    setShowMirrorConfirm(false);
    void executeSubmit();
  }

  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <p className="text-sm text-muted-foreground">
          import notes from a notras export file.
        </p>

        <Controller
          control={form.control}
          name="file"
          render={({ field: { name, onBlur, onChange, ref }, fieldState }) => {
            return (
              <Field data-invalid={Boolean(fieldState.error) || undefined}>
                <FieldLabel htmlFor="import-file">file</FieldLabel>
                <Input
                  accept=".zip"
                  id="import-file"
                  name={name}
                  onBlur={onBlur}
                  onChange={(e) => {
                    onChange(e.target.files?.[0]);
                  }}
                  ref={(el) => {
                    ref(el);
                    fileInputRef.current = el;
                  }}
                  type="file"
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            );
          }}
        />

        <Controller
          control={form.control}
          name="mode"
          render={({ field: { onChange, value } }) => {
            return (
              <Field>
                <FieldLabel htmlFor="import-mode">mode</FieldLabel>
                <Select onValueChange={onChange} value={value}>
                  <SelectTrigger aria-label="import mode" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">merge</SelectItem>
                    <SelectItem value="mirror">mirror</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {value === "merge"
                    ? "adds new notes and updates existing ones. your other notes are kept."
                    : "replaces all local notes with the imported ones. notes not in the file will be deleted."}
                </FieldDescription>
              </Field>
            );
          }}
        />

        <div className="flex justify-end">
          <Button disabled={action.isPending} type="submit">
            <UploadIcon className="h-4 w-4" />
            import notes
          </Button>
        </div>
      </form>

      <AlertDialog onOpenChange={setShowMirrorConfirm} open={showMirrorConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>mirror import</AlertDialogTitle>
            <AlertDialogDescription>
              this will replace all local notes with the imported ones. any
              notes not in the import file will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMirrorConfirm}
              variant="destructive"
            >
              continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
