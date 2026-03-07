"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { Schema } from "effect";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";

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

  const { action, form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      importNotes,
      standardSchemaResolver(Schema.standardSchemaV1(importInputSchema)),
      {
        actionProps: {
          onError({ error }) {
            toast.error(error.serverError ?? "import failed");
          },
          onSuccess({ data }) {
            toast.success(data.message);
            resetFormAndAction();

            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          },
        },
        formProps: {
          defaultValues: {
            mode: "merge",
          },
          mode: "onChange",
        },
      },
    );

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

    void handleSubmitWithAction(e);
  }

  function handleMirrorConfirm() {
    setShowMirrorConfirm(false);
    void handleSubmitWithAction();
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
