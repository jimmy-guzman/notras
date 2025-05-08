"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { Kind } from "@/lib/kind";

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

interface UnifiedNoteInputProps {
  kind?: Kind;
  query: string;
}

export function UnifiedNoteInput({ kind, query }: UnifiedNoteInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: query,
      kind: kind ?? "",
    },
    resolver: zodResolver(formSchema),
  });

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {
      await saveNote(
        values.content,
        values.kind === "" ? "thought" : (values.kind ?? "thought"),
      );

      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    if (form.formState.isSubmitSuccessful) {
      form.reset({
        content: query,
        kind,
      });
    }
  }, [form.formState.isSubmitSuccessful, query, kind, form]);

  return (
    <Form {...form}>
      <form
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:items-center sm:gap-2"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => {
            return (
              <FormItem className="w-full justify-center">
                <FormControl>
                  <ToggleGroup
                    disabled={form.formState.isSubmitting}
                    onValueChange={(value) => {
                      field.onChange(value);

                      if (value) {
                        updateParam("kind", value);
                      } else {
                        updateParam("kind", "");
                      }
                    }}
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

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => {
            return (
              <FormItem className="w-full flex-1">
                <FormControl>
                  <Input
                    {...field}
                    className="py-6 text-sm sm:text-lg"
                    disabled={form.formState.isSubmitting}
                    onChange={(e) => {
                      field.onChange(e);

                      updateParam("q", e.target.value);
                    }}
                    placeholder={`Search or write a new note...`}
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
