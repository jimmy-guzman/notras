import { ExternalLinkIcon } from "lucide-react";

import type { SelectLink } from "@/server/db/schemas/links";

interface NoteLinksProps {
  links: SelectLink[];
}

export function NoteLinks({ links }: NoteLinksProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">links</h2>
      <ul className="space-y-1">
        {links.map((link) => {
          return (
            <li key={link.id}>
              <a
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={link.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                {link.title ?? link.url}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
