import Link from "next/link";

import { getLinkedNotes } from "@/actions/get-linked-notes";

export async function LinkedNotes({ noteId }: { noteId: string }) {
  const links = await getLinkedNotes(noteId);

  if (links.length === 0) {
    return (
      <ul className="space-y-2">
        <li className="text-muted-foreground text-sm">No linked notes.</li>
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => {
        return (
          <li key={link.id}>
            <Link
              className="hover:bg-muted block rounded-md border px-3 py-2 text-sm"
              href={`/notes/${link.id}`}
            >
              <div className="truncate">{link.content}</div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
