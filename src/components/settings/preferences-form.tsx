"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Schema } from "effect";
import { useAction } from "next-safe-action/hooks";
import { useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import type { Preferences } from "@/server/schemas/user-schemas";

import { updatePreferences } from "@/actions/update-preferences";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { preferencesSchema } from "@/server/schemas/user-schemas";

interface PreferencesFormProps {
  preferences: Preferences;
}

export function PreferencesForm({ preferences }: PreferencesFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const action = useAction(updatePreferences, {
    onError: () => {
      toast.error("update failed");
    },
  });

  const form = useForm({
    defaultValues: {
      markdownPreview: preferences.markdownPreview,
      syntaxHighlighting: preferences.syntaxHighlighting,
    },
    mode: "onSubmit",
    resolver: standardSchemaResolver(
      Schema.standardSchemaV1(preferencesSchema),
    ),
  });

  const markdownPreview = useWatch({
    control: form.control,
    name: "markdownPreview",
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await action.executeAsync(data);
  });

  function submitForm() {
    formRef.current?.requestSubmit();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} ref={formRef}>
      <Controller
        control={form.control}
        name="markdownPreview"
        render={({ field }) => {
          return (
            <Field orientation="horizontal">
              <FieldLabel
                className="flex-1 cursor-pointer"
                htmlFor="markdownPreview"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">markdown preview</span>
                  <FieldDescription>
                    render note content as markdown on the detail page
                  </FieldDescription>
                </div>
              </FieldLabel>
              <Switch
                checked={field.value}
                id="markdownPreview"
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  submitForm();
                }}
              />
            </Field>
          );
        }}
      />

      <Controller
        control={form.control}
        name="syntaxHighlighting"
        render={({ field }) => {
          return (
            <Field
              data-disabled={!markdownPreview || undefined}
              orientation="horizontal"
            >
              <FieldLabel
                className="flex-1 cursor-pointer"
                htmlFor="syntaxHighlighting"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    syntax highlighting
                  </span>
                  <FieldDescription>
                    highlight code blocks with language-specific colors
                  </FieldDescription>
                </div>
              </FieldLabel>
              <Switch
                checked={field.value}
                disabled={!markdownPreview}
                id="syntaxHighlighting"
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  submitForm();
                }}
              />
            </Field>
          );
        }}
      />
    </form>
  );
}
