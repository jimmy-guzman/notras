import type { RehypeExpressiveCodeOptions } from "rehype-expressive-code";
import type { PluggableList } from "unified";

import { MarkdownAsync } from "react-markdown";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];

const expressiveCodeOptions = {
  frames: false,
  themes: ["github-dark", "github-light"],
} satisfies RehypeExpressiveCodeOptions;

const rehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeExpressiveCode, expressiveCodeOptions],
];

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
      rehypePlugins={syntaxHighlighting ? rehypePlugins : undefined}
      remarkPlugins={remarkPlugins}
    >
      {content}
    </MarkdownAsync>
  );
}
