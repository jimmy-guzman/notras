import { Info } from "lucide-react";
import Link from "next/link";

import { getLinkedNotes } from "@/actions/get-linked-notes";
import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription } from "../ui/alert";

export async function LinkedNotes({ noteId }: { noteId: string }) {
  const links = await getLinkedNotes(noteId);

  if (links.length === 0) {
    return (
      <Alert className="text-center">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <p>No notes related notes.</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => {
        return (
          <li key={link.id}>
            <Link
              className="hover:bg-muted block rounded-md border px-3 py-2"
              href={`/notes/${link.id}`}
            >
              <div className="truncate text-sm">{link.content}</div>
              <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                <Badge className="capitalize" variant="outline">
                  {link.reason.replace("-", " ")}
                </Badge>
                {link.confidence !== null && (
                  <span className="tabular-nums opacity-70">
                    {}
                    {(link.confidence * 100).toFixed(0)}% match
                  </span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
