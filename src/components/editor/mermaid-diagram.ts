import type { renderMermaidSVG } from "beautiful-mermaid";

import { styleNonce } from "@/lib/style-nonce";
import { reasonOf } from "@/lib/ui/failure";

type Engine = { reason: string } | { render: typeof renderMermaidSVG };

let engine: Engine | undefined;

// Loaded as the module evaluates, so the chunk lands ahead of any note that
// draws. Resolves once it has loaded or failed.
export const mermaidSettled = (async () => {
  try {
    const { renderMermaidSVG } = await import("beautiful-mermaid");
    engine = { render: renderMermaidSVG };
  } catch (error) {
    engine = {
      reason: reasonOf(error) ?? "The diagram renderer did not load",
    };
  }
})();

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
  const styles = svg.querySelectorAll("style");

  if (styles.length === 0) {
    throw new Error("The drawing carries no stylesheet");
  }

  // An xy chart carries a second stylesheet for its series, and the policy
  // drops any block without the nonce.
  for (const style of styles) {
    // The stylesheet imports Inter from Google Fonts. The policy blocks the
    // fetch and the app names its own face, so only the import goes.
    style.textContent = style.textContent.replaceAll(/@import[^;]*;/gu, "");
    if (styleNonce !== undefined) {
      style.setAttribute("nonce", styleNonce);
    }
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

function reasonLine(reason: string) {
  const line = document.createElement("div");
  line.className = "code-block-reason";
  line.contentEditable = "false";
  line.textContent = reason;

  return line;
}

/**
 * A `mermaid` fence's drawing, or the reason it has none. Nothing for an
 * empty fence and until the renderer has settled, so a note keeps editing
 * around it.
 */
export function drawMermaid(code: string): HTMLElement | undefined {
  if (engine === undefined || code.trim() === "") {
    return undefined;
  }
  if ("reason" in engine) {
    return reasonLine(engine.reason);
  }

  const drawn = draw(engine.render, code);

  if (drawn.reason !== undefined) {
    return reasonLine(drawn.reason);
  }

  const host = document.createElement("div");
  host.className = "code-block-diagram";
  host.contentEditable = "false";
  host.append(toElement(drawn.svg));

  return host;
}
