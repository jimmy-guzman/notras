"use client";

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getLinkedNotes } from "@/actions/get-linked-notes";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface NoteLinksPopoverProps {
  noteId: string;
}

export function NoteLinksPopover({ noteId }: NoteLinksPopoverProps) {
  const [links, setLinks] = useState<{ content: string; id: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || links.length > 0) return;

    void getLinkedNotes(noteId).then((data) => {
      setLinks(data);
    });
  }, [open, links.length, noteId]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost">
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        {links.length === 0 ? (
          <p className="text-muted-foreground">No linked notes.</p>
        ) : (
          <ul className="border-muted space-y-1 border-l pl-2">
            {links.map((link) => {
              return (
                <li className="text-muted-foreground truncate" key={link.id}>
                  <Link
                    className="hover:underline"
                    // eslint-disable-next-line no-magic-numbers -- TODO
                    href={`/?q=${encodeURIComponent(link.content.slice(0, 40))}`}
                  >
                    {/* eslint-disable-next-line no-magic-numbers -- TODO */}“
                    {link.content.slice(0, 100)}”
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
