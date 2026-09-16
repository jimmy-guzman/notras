import { save } from "@tauri-apps/plugin-dialog";

import { commands } from "@/server/adapters/bindings";

/**
 * Paper has no scroll, so a table wider than the column shrinks to fit it. The
 * column is the width the surface's first block has on screen, which `pdf.rs`
 * gives the page whatever its size.
 */
function fitTables(surface: HTMLElement, sheet: HTMLElement) {
  const column = surface.firstElementChild?.getBoundingClientRect().width ?? 0;
  const live = surface.querySelectorAll(".tableWrapper");
  const copies = sheet.querySelectorAll<HTMLElement>(".tableWrapper");

  for (const [index, copy] of copies.entries()) {
    const width = live[index]?.scrollWidth ?? 0;

    if (width > column) {
      copy.style.zoom = String(column / width);
    }
  }
}

/** What the editor paints for the moment: the selection, a find, an empty note. */
const STATE_CLASSES = [
  "is-editor-empty",
  "note-find-active",
  "note-find-match",
  "note-find-open",
  "ProseMirror-selectednode",
  "selectedCell",
];

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/**
 * WebKit's print layout ignores `break-after: avoid`, so each heading's copy
 * learns how far the block after it reaches and the stylesheet stretches the
 * heading's unsplittable box that far. A list can split, so a heading carries
 * its first item only.
 */
function keepHeadings(surface: HTMLElement, sheet: HTMLElement) {
  const live = surface.querySelectorAll(HEADINGS);
  const copies = sheet.querySelectorAll<HTMLElement>(HEADINGS);

  for (const [index, copy] of copies.entries()) {
    const heading = live[index];
    const next = heading?.nextElementSibling;

    if (heading === undefined || next === null || next === undefined) {
      continue;
    }

    const carried = next.matches("ol, ul")
      ? (next.firstElementChild ?? next)
      : next;
    const reach =
      carried.getBoundingClientRect().bottom -
      heading.getBoundingClientRect().bottom;

    copy.style.setProperty("--keep-with-next", `${reach}px`);
  }
}

/**
 * Save a rendered note as a PDF through the native save dialog and answer
 * where it went, or null when the dialog was cancelled and nothing was
 * written. A copy of the surface goes into a `.print-sheet`, the one element
 * print media shows, so the PDF is the note as the editor drew it and none of
 * the chrome around it.
 */
export async function exportPdf(
  surface: HTMLElement,
  name: string,
  title: string
): Promise<string | null> {
  const path = await save({
    defaultPath: `${name}.pdf`,
    filters: [{ extensions: ["pdf"], name: "pdf" }],
  });

  if (path === null) {
    return null;
  }

  const sheet = document.createElement("div");

  sheet.className = "print-sheet";
  sheet.append(surface.cloneNode(true));
  for (const element of sheet.querySelectorAll("*")) {
    element.classList.remove(...STATE_CLASSES);
  }
  fitTables(surface, sheet);
  keepHeadings(surface, sheet);
  document.body.append(sheet);

  try {
    // A broken image rejects and prints as the broken image the editor shows.
    await Promise.allSettled(
      [...sheet.querySelectorAll("img")].map(async (image) => {
        await image.decode();
      })
    );
    await commands.exportPdf(path, title);
  } finally {
    sheet.remove();
  }

  return path;
}
