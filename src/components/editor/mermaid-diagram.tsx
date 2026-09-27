import type { renderMermaidSVG } from "beautiful-mermaid";
import { Suspense, use, useDeferredValue } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";

import { styleNonce } from "@/lib/style-nonce";
import { reasonOf } from "@/lib/ui/failure";

// Loaded as the module evaluates, so the engine's chunk lands after launch
// and ahead of any note that draws. `use` reads a settled promise without
// suspending, so from then on a fence draws in its node view's first render.
const engine = import("beautiful-mermaid");

function draw(render: typeof renderMermaidSVG, code: string) {
  try {
    return { svg: render(code, { transparent: true }) };
  } catch (error) {
    return { reason: reasonOf(error) ?? "The diagram could not be drawn" };
  }
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

function Drawing({ code }: { code: string }) {
  const { renderMermaidSVG } = use(engine);
  const drawn = draw(renderMermaidSVG, code);

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
 * an empty fence and until the renderer has loaded, and the reason when it
 * fails to, so a note keeps editing around it.
 */
export function MermaidDiagram({ code }: { code: string }) {
  // A keystroke commits before the drawing for it is laid out, and the last
  // drawing stays on screen until then.
  const settled = useDeferredValue(code);

  if (settled.trim() === "") {
    return null;
  }

  return (
    <ErrorBoundary fallbackRender={renderLoadFailure} resetKeys={[settled]}>
      <Suspense fallback={null}>
        <Drawing code={settled} />
      </Suspense>
    </ErrorBoundary>
  );
}
