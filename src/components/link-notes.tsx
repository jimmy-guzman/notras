"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getLinkedNotes } from "@/actions/get-linked-notes";

import { DropdownMenuItem } from "./ui/dropdown-menu";

export function LinkedNotesListContent({ noteId }: { noteId: string }) {
  const [links, setLinks] = useState<{ content: string; id: string }[]>([]);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (hasFetched) return;
    void getLinkedNotes(noteId).then((data) => {
      setLinks(data);
      setHasFetched(true);
    });
  }, [noteId, hasFetched]);

  if (!hasFetched) {
    return (
      <div className="text-muted-foreground px-2 py-1 text-sm">
        Loading links...
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="text-muted-foreground px-2 py-1 text-sm">
        No linked notes
      </div>
    );
  }

  return (
    <>
      {links.map((link) => {
        return (
          <DropdownMenuItem asChild key={link.id}>
            {/* eslint-disable-next-line no-magic-numbers -- TODO */}
            <Link href={`/?q=${encodeURIComponent(link.content.slice(0, 40))}`}>
              {/* eslint-disable-next-line no-magic-numbers -- TODO */}“
              {link.content.slice(0, 100)}”
            </Link>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
