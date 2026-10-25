import type { render } from "pele";

import { reasonOf } from "@/lib/ui/failure";

type Engine = { reason: string } | { render: typeof render };

let engine: Engine | undefined;

// Loaded as the module evaluates, so the chunk lands ahead of any note that
// draws. Resolves once it has loaded or failed.
export const mermaidSettled = (async () => {
  try {
    const pele = await import("pele");
    engine = { render: pele.render };
  } catch (error) {
    engine = {
      reason: reasonOf(error) ?? "The diagram renderer did not load",
    };
  }
})();

// The rest of pele's message quotes the source, which the open code shows.
function firstLine(reason: string) {
  return reason.replace(/\n[\s\S]*$/u, "").replace(/:$/u, "");
}

function draw(engineRender: typeof render, code: string) {
  const fontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-sans")
    .trim();

  try {
    return {
      svg: engineRender(code, { fontFamily, images: false, links: false }).svg,
    };
  } catch (error) {
    return {
      reason: firstLine(reasonOf(error) ?? "The diagram could not be drawn"),
    };
  }
}

// Parsed apart from the page: its style policy drops the inline styles pele
// draws with, and adoption re-checks nothing.
function toElement(markup: string) {
  const svg = new DOMParser().parseFromString(
    markup,
    "image/svg+xml"
  ).documentElement;

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
 * empty fence, for one that draws nothing, and until the renderer has
 * settled, so a note keeps editing around it.
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

  const svg = toElement(drawn.svg);

  // A header with nothing under it draws a frame of empty `<g>` wrappers.
  if (
    svg.querySelector("text, path, rect, circle, polygon, ellipse") === null
  ) {
    return undefined;
  }

  const host = document.createElement("div");
  host.className = "code-block-diagram";
  host.contentEditable = "false";
  host.append(svg);

  return host;
}
