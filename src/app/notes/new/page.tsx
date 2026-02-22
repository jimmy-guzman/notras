import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { createNote } from "@/actions/create-note";
import { FormHotkeys } from "@/components/notes/form-hotkeys";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

export default function NewNotePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link href="/notes">
            <ArrowLeftIcon className="h-4 w-4" /> Notes
          </Link>
        </Button>
      </div>

      <FormHotkeys action={createNote} cancelHref="/notes">
        <Textarea
          className="text-lg leading-relaxed"
          data-autofocus
          name="content"
          placeholder="Write your note here..."
          rows={10}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button asChild variant="outline">
            <Link href="/notes">Cancel</Link>
          </Button>
          <Button type="submit">
            <span className="flex items-center gap-2 text-sm">
              Create
              <span className="hidden gap-0.5 sm:inline-flex">
                <Kbd>⌘</Kbd>
                <Kbd>⏎</Kbd>
              </span>
            </span>
          </Button>
        </div>
      </FormHotkeys>
    </div>
  );
}
