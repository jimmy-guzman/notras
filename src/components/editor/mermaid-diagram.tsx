import { useDebouncedValue } from "@tanstack/react-pacer";
import { Suspense, use } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";

import { styleNonce } from "@/lib/style-nonce";
import { reasonOf } from "@/lib/ui/failure";

// Fetched at module load, so the chunk, mostly the layout engine, is in hand
// before a note draws.
const loading = import("beautiful-mermaid");

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
  style.textContent = style.textContent.replace(/@import[^;]*;/u, "");
  if (styleNonce !== undefined) {
    style.setAttribute("nonce", styleNonce);
  }
  // The root carries the library's default inks; the stylesheet sets the app's.
  svg.removeAttribute("style");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "diagram");

  return svg;
}

function draw(renderer: Awaited<typeof loading>, code: string) {
  try {
    return {
      svg: toElement(renderer.renderMermaidSVG(code, { transparent: true })),
    };
  } catch (error) {
    return { reason: reasonOf(error) ?? "The diagram could not be drawn" };
  }
}

function Drawing({ code }: { code: string }) {
  const drawn = draw(use(loading), code);

  if ("reason" in drawn) {
    return (
      <div className="code-block-reason" contentEditable={false}>
        {drawn.reason}
      </div>
    );
  }

  return (
    <div
      className="code-block-diagram"
      contentEditable={false}
      ref={(host) => {
        host?.replaceChildren(drawn.svg);
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
 * an empty fence and while the renderer is still on its way, and the reason
 * when the renderer never arrives, so a note keeps editing around it.
 */
export function MermaidDiagram({ code }: { code: string }) {
  // A large diagram laid out on every keystroke would land on the keystroke's frame.
  const [settled] = useDebouncedValue(code, { wait: 150 });

  if (settled.trim() === "") {
    return null;
  }

  return (
    <ErrorBoundary fallbackRender={renderLoadFailure}>
      <Suspense fallback={null}>
        <Drawing code={settled} />
      </Suspense>
    </ErrorBoundary>
  );
}
