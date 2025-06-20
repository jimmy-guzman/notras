"use client";

import { Command } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateNote } from "@/actions/update-note";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditNoteFormProps {
  initialContent?: string;
  noteId: string;
}

export default function EditNoteForm({
  initialContent = "",
  noteId,
}: EditNoteFormProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        await updateNote(noteId, content);
        toast.success("Note saved successfully!");
        router.back();
      } catch {
        toast.error("Failed to save note. Please try again.");
      }
    });
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          className="resize-none"
          disabled={isPending}
          id="content"
          onChange={(e) => {
            setContent(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();

              handleSubmit(e);
            }
          }}
          placeholder="Write your note content here..."
          rows={10}
          value={content}
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          disabled={isPending}
          onClick={handleCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? (
            "Saving..."
          ) : (
            <span className="flex items-center gap-2 text-sm">
              Save
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
  );
}
