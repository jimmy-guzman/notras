import { save } from "@tauri-apps/plugin-dialog";

import { commands } from "@/server/adapters/bindings";

/**
 * Paper has no scroll, so a table wider than its wrapper on the sheet shrinks
 * to fit it: the column, or its item under a list item.
 */
function fitTables(sheet: HTMLElement) {
  for (const wrapper of sheet.querySelectorAll<HTMLElement>(".tableWrapper")) {
    const width =
      wrapper.querySelector("table")?.getBoundingClientRect().width ?? 0;

    if (width > wrapper.clientWidth) {
      wrapper.style.zoom = String(wrapper.clientWidth / width);
    }
  }
}

/** What the editor paints for the moment: the selection, a find, an empty note, a diagram's code. */
const STATE_CLASSES = [
  "code-block-editing",
  "is-editor-empty",
  "note-find-active",
  "note-find-match",
  "note-find-open",
  "ProseMirror-selectednode",
  "selected-text",
  "selectedCell",
];

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/**
 * WebKit's print layout ignores `break-after: avoid`, so each heading on the
 * sheet learns how far the block after it reaches and the stylesheet stretches
 * the heading's unsplittable box that far. A list can split, so a heading
 * carries its first item only.
 */
function keepHeadings(sheet: HTMLElement) {
  for (const heading of sheet.querySelectorAll<HTMLElement>(HEADINGS)) {
    const next = heading.nextElementSibling;

    if (next === null) {
      continue;
    }

    const carried = next.matches("ol, ul")
      ? (next.firstElementChild ?? next)
      : next;

    const reach =
      carried.getBoundingClientRect().bottom -
      heading.getBoundingClientRect().bottom;

    heading.style.setProperty("--keep-with-next", `${reach}px`);
  }
}

/**
 * Save a rendered note as a PDF through the native save dialog and answer
 * where it went, or null when the dialog was cancelled and nothing was
 * written. A copy of the surface goes into a `.print-sheet`, the one element
 * print media shows, so the PDF is the note as the editor drew it and none of
 * the bars around it. `painted` runs after the dialog closes, so highlighting
 * a refresh started during the dialog lands before the copy.
 */
export async function exportPdf(
  surface: HTMLElement,
  name: string,
  title: string,
  painted: () => Promise<void>
): Promise<string | null> {
  const path = await save({
    defaultPath: `${name}.pdf`,
    filters: [{ extensions: ["pdf"], name: "pdf" }],
  });

  if (path === null) {
    return null;
  }

  const width = await commands.pdfLayoutWidth();

  if (width === null) {
    throw new Error("The paper's width could not be read");
  }

  // Nothing is awaited between the paint and the copy, or a highlight started
  // in the gap would print half applied.
  await painted();
  const sheet = document.createElement("div");

  sheet.className = "print-sheet";
  sheet.style.setProperty("--print-width", `${width}px`);
  sheet.append(surface.cloneNode(true));

  for (const element of sheet.querySelectorAll("*")) {
    element.classList.remove(...STATE_CLASSES);
  }

  document.body.append(sheet);

  try {
    // An image that did not load rejects and prints the reason the editor shows.
    // An image takes its height once decoded, so measuring waits for it.
    await Promise.allSettled(
      [...sheet.querySelectorAll("img")].map(async (image) => {
        await image.decode();
      })
    );
    fitTables(sheet);
    keepHeadings(sheet);
    await commands.exportPdf(path, title);
  } finally {
    sheet.remove();
  }

  return path;
}
