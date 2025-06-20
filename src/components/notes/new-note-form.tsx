"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Command } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createNote } from "@/actions/create-note";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";

const formSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
  kind: z.optional(z.enum([...KIND_VALUES, ""])),
});

export function NewNoteForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: "",
      kind: "",
    },
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const note = await createNote(
        values.content,
        values.kind === "" ? undefined : values.kind,
      );

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

      router.back();
    } catch {
      toast.error("Failed to save note. Please try again.");
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();

      void form.handleSubmit(onSubmit)();
    }
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>Content</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    className="resize-none"
                    disabled={form.formState.isSubmitting}
                    onKeyDown={handleKeyDown}
                    placeholder="Write your note content here..."
                    rows={8}
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
              <FormItem>
                <FormLabel>Category (Optional)</FormLabel>
                <FormControl>
                  <ToggleGroup
                    className="justify-start"
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

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            disabled={form.formState.isSubmitting}
            onClick={handleCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting ? (
              "Saving..."
            ) : (
              <span className="flex items-center gap-2 text-sm">
                Create
                <div className="hidden gap-0.5 sm:inline-flex">
                  <kbd className="border-border bg-accent text-accent-foreground inline-flex h-5 items-center justify-center rounded border px-1.5 font-mono text-xs select-none">
                    <Command className="h-3 w-3" />
                  </kbd>
                  <kbd className="border-border bg-accent text-accent-foreground inline-flex h-5 items-center justify-center rounded border px-1.5 font-mono text-xs select-none">
                    ↵
                  </kbd>
                </div>
              </span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
