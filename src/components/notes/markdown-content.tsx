import type { RehypeExpressiveCodeOptions } from "rehype-expressive-code";

import { MarkdownAsync } from "react-markdown";
import rehypeExpressiveCode from "rehype-expressive-code";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

const expressiveCodeOptions = {
  frames: false,
  themes: ["github-dark", "github-light"],
} satisfies RehypeExpressiveCodeOptions;

interface MarkdownContentProps {
  content: string;
  syntaxHighlighting: boolean;
}

export function MarkdownContent({
  content,
  syntaxHighlighting,
}: MarkdownContentProps) {
  return (
    <MarkdownAsync
      rehypePlugins={
        syntaxHighlighting
          ? [[rehypeExpressiveCode, expressiveCodeOptions]]
          : undefined
      }
      remarkPlugins={remarkPlugins}
    >
      {content}
    </MarkdownAsync>
  );
}
