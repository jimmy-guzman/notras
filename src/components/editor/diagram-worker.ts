import { renderMermaidSVG } from "beautiful-mermaid";

import type { DiagramResponse } from "@/components/editor/mermaid-diagram";
import { reasonOf } from "@/lib/ui/failure";

function answer(code: string): DiagramResponse {
  try {
    return { svg: renderMermaidSVG(code, { transparent: true }) };
  } catch (error) {
    return { reason: reasonOf(error) ?? "The diagram could not be drawn" };
  }
}

self.addEventListener("message", (event: MessageEvent<string>) => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker scope's second argument is a transfer list, not an origin
  self.postMessage(answer(event.data));
});
