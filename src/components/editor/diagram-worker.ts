import { renderMermaidSVG } from "beautiful-mermaid";

import type {
  DiagramRequest,
  DiagramResponse,
} from "@/components/editor/mermaid-diagram";
import { reasonOf } from "@/lib/ui/failure";

function answer({ code, id }: DiagramRequest): DiagramResponse {
  try {
    return { id, svg: renderMermaidSVG(code, { transparent: true }) };
  } catch (error) {
    return { id, reason: reasonOf(error) ?? "The diagram could not be drawn" };
  }
}

self.addEventListener("message", (event: MessageEvent<DiagramRequest>) => {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker scope's second argument is a transfer list, not an origin
  self.postMessage(answer(event.data));
});
