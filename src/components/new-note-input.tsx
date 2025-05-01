"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

const formSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
  kind: z.enum(KIND_VALUES).optional(),
});

export function NewNoteInput() {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: "",
      kind: "thought",
    },
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await saveNote(values.content, values.kind);

    form.reset();

    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:gap-2"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => {
            return (
              <FormItem className="w-full md:w-auto">
                <FormControl>
                  <Select
                    disabled={form.formState.isSubmitting}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <SelectTrigger
                      aria-label="Select Kind"
                      className="text-muted-foreground w-full py-6 text-sm sm:w-34"
                    >
                      <SelectValue placeholder="Select kind" />
                    </SelectTrigger>
                    <SelectContent>
                      {KIND_VALUES.map((value) => {
                        return (
                          <SelectItem key={value} value={value}>
                            {KIND_LABELS[value]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
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
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    className="py-6 text-sm sm:text-lg"
                    disabled={form.formState.isSubmitting}
                    placeholder="What's on your mind?"
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
