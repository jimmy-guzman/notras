"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateNote } from "@/actions/update-note";
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

import { Kbd } from "../kbd";

const formSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
});

interface EditNoteFormProps {
  initialContent?: string;
  noteId: string;
}

export function EditNoteForm({
  initialContent = "",
  noteId,
}: EditNoteFormProps) {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      content: initialContent,
    },
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await updateNote(noteId, values.content);

      toast.success("Note saved.");
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
                    rows={10}
                  />
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
                Save
                <div className="hidden gap-0.5 sm:inline-flex">
                  <Kbd>⌘</Kbd>
                  <Kbd>⏎</Kbd>
                </div>
              </span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
