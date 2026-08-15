import { useNavigate } from "@tanstack/react-router";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Suspense } from "react";

import { MarkdownContent } from "@/components/notes/markdown-content";
import { Skeleton } from "@/components/ui/skeleton";
import { parseNote } from "@/core";

const WIKILINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

/** Rewrite `[[title]]` into links the preview's anchor component understands. */
function withWikilinks(body: string) {
  return body.replaceAll(WIKILINK_PATTERN, (_match, title: string) => {
    return `[${title}](wiki:${encodeURIComponent(title.trim())})`;
  });
}

interface NotePreviewProps {
  content: string;
  notesDir: string;
  syntaxHighlighting: boolean;
  /** Lowercased note title -> path, for resolving wikilinks. */
  titleToPath: Map<string, string>;
}

export function NotePreview({
  content,
  notesDir,
  syntaxHighlighting,
  titleToPath,
}: NotePreviewProps) {
  const navigate = useNavigate();
  const body = withWikilinks(parseNote(content).body);

  return (
    <div className="allow-select min-h-0 flex-1 overflow-y-auto">
      <div className="note-preview-prose mx-auto prose max-w-2xl px-6 py-6 prose-stone dark:prose-invert">
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <MarkdownContent
            components={{
              a: ({ children, href, ...props }) => {
                if (href?.startsWith("wiki:") === true) {
                  const title = decodeURIComponent(
                    href.slice("wiki:".length),
                  ).toLowerCase();
                  const target = titleToPath.get(title);

                  return (
                    <a
                      {...props}
                      className={
                        target === undefined
                          ? "cursor-default no-underline opacity-60"
                          : undefined
                      }
                      href={href}
                      onClick={(event) => {
                        event.preventDefault();
                        if (target !== undefined) {
                          void navigate({
                            params: { _splat: target },
                            to: "/notes/$",
                          });
                        }
                      }}
                    >
                      {children}
                    </a>
                  );
                }

                return (
                  <a {...props} href={href} rel="noreferrer" target="_blank">
                    {children}
                  </a>
                );
              },
              img: ({ src, ...props }) => {
                const resolved =
                  typeof src === "string" && !src.includes("://")
                    ? convertFileSrc(`${notesDir}/${src}`)
                    : src;

                // eslint-disable-next-line jsx-a11y/alt-text -- alt arrives via the spread markdown props
                return <img {...props} src={resolved} />;
              },
            }}
            content={body}
            syntaxHighlighting={syntaxHighlighting}
          />
        </Suspense>
      </div>
    </div>
  );
}
