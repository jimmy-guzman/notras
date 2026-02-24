import { BellIcon, ClockIcon } from "lucide-react";
import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils/format";
import { truncate } from "@/lib/utils/truncate";

const MAX_CONTENT_LENGTH = 200;

function ReminderItem({
  note,
  overdue,
}: {
  note: SelectNote;
  overdue?: boolean;
}) {
  const displayContent = truncate(note.content, MAX_CONTENT_LENGTH);

  return (
    <Link
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      href={`/notes/${note.id}`}
    >
      <p className="min-w-0 flex-1 truncate text-sm leading-relaxed text-foreground transition-colors group-hover:text-foreground/90">
        {displayContent}
      </p>
      {note.remindAt && (
        <Badge variant={overdue ? "destructive" : "secondary"}>
          {formatDateTime(note.remindAt)}
        </Badge>
      )}
    </Link>
  );
}

function ReminderSection({
  icon,
  label,
  notes,
  overdue,
}: {
  icon: React.ReactNode;
  label: string;
  notes: SelectNote[];
  overdue?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={`flex items-center gap-2 text-sm font-medium ${overdue ? "text-destructive" : "text-muted-foreground"}`}
      >
        {icon}
        {label}
      </h2>
      <div className="flex flex-col">
        {notes.map((note, index) => {
          return (
            <div key={note.id}>
              {index > 0 && <Separator />}
              <ReminderItem note={note} overdue={overdue} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RemindersList({
  overdue,
  upcoming,
}: {
  overdue: SelectNote[];
  upcoming: SelectNote[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {overdue.length > 0 && (
        <ReminderSection
          icon={<BellIcon className="h-4 w-4" />}
          label="overdue"
          notes={overdue}
          overdue
        />
      )}

      {upcoming.length > 0 && (
        <ReminderSection
          icon={<ClockIcon className="h-4 w-4" />}
          label="upcoming"
          notes={upcoming}
        />
      )}
    </div>
  );
}
