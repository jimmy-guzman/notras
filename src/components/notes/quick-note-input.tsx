"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createNote } from "@/actions/create-note";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
});

export function QuickNoteInput() {
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: "",
    },
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const note = await createNote(values.content);

      toast.success("Note saved.", {
        action: (
          <Link
            data-action="true"
            data-button="true"
            href={`/notes/${note.id}`}
          >
            View Note
          </Link>
        ),
      });
    } catch {
      toast.error("Failed to save note. Please try again.");
    }
  };

  useEffect(() => {
    if (form.formState.isSubmitSuccessful) {
      form.reset({ content: "" });

      form.setFocus("content");
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
                    placeholder="Write a new note..."
                  />
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
