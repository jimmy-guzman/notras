"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { saveNote } from "@/actions/save-note";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

const formSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
  kind: z.optional(z.enum([...KIND_VALUES, ""])),
});

export function QuickNoteInput() {
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: "",
      kind: "",
    },
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await saveNote(
      values.content,
      values.kind === "" ? undefined : values.kind,
    );

    toast.success("Note saved");
  };

  useEffect(() => {
    if (form.formState.isSubmitSuccessful) {
      form.reset({ content: "", kind: "" });
    }
  }, [form.formState.isSubmitSuccessful, form]);

  return (
    <Form {...form}>
      <form
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:items-center sm:gap-2"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => {
            return (
              <FormItem className="w-full flex-1">
                <FormControl>
                  <Input
                    {...field}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- this is okay
                    autoFocus
                    className="py-6 text-sm sm:text-lg"
                    disabled={form.formState.isSubmitting}
                    onChange={field.onChange}
                    placeholder="Write a new note..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => {
            return (
              <FormItem className="w-full justify-center">
                <FormControl>
                  <ToggleGroup
                    disabled={form.formState.isSubmitting}
                    onValueChange={field.onChange}
                    size="sm"
                    type="single"
                    value={field.value}
                  >
                    {KIND_VALUES.map((value) => {
                      return (
                        <ToggleGroupItem
                          className="w-18"
                          key={value}
                          value={value}
                        >
                          {KIND_LABELS[value]}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </form>
    </Form>
  );
}
