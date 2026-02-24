import { createNote } from "@/actions/create-note";
import { BackLink } from "@/components/back-link";
import { FormHotkeys } from "@/components/notes/form-hotkeys";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

export default function NewNotePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <BackLink href="/notes" label="notes" />
      </div>

      <FormHotkeys action={createNote}>
        <Textarea
          className="text-lg leading-relaxed"
          data-autofocus
          name="content"
          placeholder="write your note here..."
          rows={10}
        />
        <div className="flex justify-end pt-4">
          <Button type="submit">
            <span className="flex items-center gap-2 text-sm">
              create
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
