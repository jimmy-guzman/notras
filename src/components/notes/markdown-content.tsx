import type { RehypeExpressiveCodeOptions } from "rehype-expressive-code";
import type { PluggableList } from "unified";

import { MarkdownAsync } from "react-markdown";
import rehypeExpressiveCode from "rehype-expressive-code";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { ExpressiveCodeScript } from "./expressive-code-script";

const remarkPlugins = [remarkGfm];

const expressiveCodeOptions = {
  frames: true,
  themes: ["github-dark", "github-light"],
} satisfies RehypeExpressiveCodeOptions;

const rehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeExpressiveCode, expressiveCodeOptions],
];

// react-markdown renders <script> tags as inert React elements — React never
// executes them. We intercept them with a client component that re-runs the
// code via useEffect so expressive-code's copy-button handler is attached.
const components = {
  script: ExpressiveCodeScript,
};

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
      components={syntaxHighlighting ? components : undefined}
      rehypePlugins={syntaxHighlighting ? rehypePlugins : undefined}
      remarkPlugins={remarkPlugins}
    >
      {content}
    </MarkdownAsync>
  );
}
