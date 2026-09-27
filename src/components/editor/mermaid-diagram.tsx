import { Suspense, use, useDeferredValue, useId, useMemo } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";

import { styleNonce } from "@/lib/style-nonce";
import { reasonOf } from "@/lib/ui/failure";

export type DiagramResponse = { reason: string } | { svg: string };

interface Waiting {
  code: string;
  resolvers: PromiseWithResolvers<DiagramResponse>;
}

/** The newest code of each fence, until the worker is free for it. */
const waiting = new Map<string, Waiting>();
let inFlight: PromiseWithResolvers<DiagramResponse> | undefined;
let instance: undefined | Worker;

function post(worker: Worker) {
  if (inFlight !== undefined) {
    return;
  }
  const [next] = waiting;
  if (next === undefined) {
    return;
  }
  const [fence, { code, resolvers }] = next;
  waiting.delete(fence);
  inFlight = resolvers;
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's second argument is a transfer list, not an origin
  worker.postMessage(code);
}

function start() {
  const worker = new Worker(new URL("diagram-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener(
    "message",
    ({ data }: MessageEvent<DiagramResponse>) => {
      inFlight?.resolve(data);
      inFlight = undefined;
      post(worker);
    }
  );
  // A worker that cannot start answers nothing, so its requests fail here
  // and the next request starts a fresh one.
  worker.addEventListener("error", (event) => {
    worker.terminate();
    instance = undefined;
    inFlight?.reject(new Error(event.message));
    inFlight = undefined;
    for (const { resolvers } of waiting.values()) {
      resolvers.reject(new Error(event.message));
    }
    waiting.clear();
  });
  return worker;
}

// Started as the module evaluates, so the layout engine loads in its own
// thread ahead of any note that draws, and lays out there too: a 400-node
// flowchart takes 293ms.
instance = start();

async function request(fence: string, code: string) {
  const resolvers = Promise.withResolvers<DiagramResponse>();
  // Newer code for a fence takes the place of code still waiting. The render
  // that asked for the older code is superseded, and its promise goes with it.
  waiting.set(fence, { code, resolvers });
  post((instance ??= start()));
  return await resolvers.promise;
}

// The attributes a `style` or `linkStyle` value reaches, and what a value
// there may be: a color, a width, or one of the drawing's own variables and
// fragments, so nothing that could name a resource.
const PAINTED = ["color", "fill", "stroke", "stroke-width"];
const PAINT =
  /^(?:#[\da-f]{3,8}|[a-z]+|\d+(?:\.\d+)?(?:px|em|%)?|var\(--[\w-]+\)|url\(#[\w-]+\)|(?:rgb|hsl)a?\([\d.,%\s/]+\))$/iu;

function toElement(markup: string) {
  const svg = new DOMParser().parseFromString(
    markup,
    "image/svg+xml"
  ).documentElement;
  const style = svg.querySelector("style");

  if (style === null || style.textContent === null) {
    throw new Error("The drawing carries no stylesheet");
  }

  // The stylesheet imports Inter from Google Fonts. The policy blocks the
  // fetch and the app names its own face, so only the import goes.
  style.textContent = style.textContent.replaceAll(/@import[^;]*;/gu, "");
  if (styleNonce !== undefined) {
    style.setAttribute("nonce", styleNonce);
  }
  // The root carries the library's default inks; the stylesheet sets the app's.
  svg.removeAttribute("style");
  for (const element of svg.querySelectorAll("*")) {
    for (const name of PAINTED) {
      const value = element.getAttribute(name);
      if (value !== null && !PAINT.test(value)) {
        element.removeAttribute(name);
      }
    }
  }
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "diagram");

  return svg;
}

function Drawing({ drawing }: { drawing: Promise<DiagramResponse> }) {
  const drawn = use(drawing);

  if ("reason" in drawn) {
    return (
      <div className="code-block-reason" contentEditable={false}>
        {drawn.reason}
      </div>
    );
  }

  const svg = toElement(drawn.svg);

  return (
    <div
      className="code-block-diagram"
      contentEditable={false}
      ref={(host) => {
        host?.replaceChildren(svg);
      }}
    />
  );
}

function renderLoadFailure({ error }: FallbackProps) {
  return (
    <div className="code-block-reason" contentEditable={false}>
      {reasonOf(error) ?? "The diagram renderer did not load"}
    </div>
  );
}

/**
 * A `mermaid` fence's drawing, or the reason it has none. Renders nothing for
 * an empty fence and until the first drawing arrives, and the reason when the
 * renderer fails, so a note keeps editing around it.
 */
export function MermaidDiagram({ code }: { code: string }) {
  // The last drawing stays on screen while the next one is laid out.
  const settled = useDeferredValue(code);
  const fence = useId();
  // `use` needs one promise per code across the renders a suspended first
  // draw retries, and this component stays committed while the drawing
  // suspends below it, so the promise lives here rather than in a cache.
  const drawing = useMemo(
    (): Promise<DiagramResponse> | undefined =>
      settled.trim() === "" ? undefined : request(fence, settled),
    [fence, settled]
  );

  if (drawing === undefined) {
    return null;
  }

  return (
    <ErrorBoundary fallbackRender={renderLoadFailure} resetKeys={[settled]}>
      <Suspense fallback={null}>
        <Drawing drawing={drawing} />
      </Suspense>
    </ErrorBoundary>
  );
}
