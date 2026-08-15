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
const baseComponents = {
  script: ExpressiveCodeScript,
};

type MarkdownComponents = React.ComponentProps<
  typeof MarkdownAsync
>["components"];

interface MarkdownContentProps {
  components?: MarkdownComponents;
  content: string;
  syntaxHighlighting: boolean;
}

export function MarkdownContent({
  components,
  content,
  syntaxHighlighting,
}: MarkdownContentProps) {
  return (
    <MarkdownAsync
      components={
        syntaxHighlighting ? { ...baseComponents, ...components } : components
      }
      rehypePlugins={syntaxHighlighting ? rehypePlugins : undefined}
      remarkPlugins={remarkPlugins}
    >
      {content}
    </MarkdownAsync>
  );
}
