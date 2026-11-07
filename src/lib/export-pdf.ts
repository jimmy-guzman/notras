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

/** A mark or a selection's span around inline content, which an embed is not. */
const WRAPPERS = "a, code, em, s, span:not(.embed), strong, u";

/** Nothing but space, or a space and the line it ends. */
const BLANK_LINE = /^\s+$|^[^\S\n]*\n/u;

function nodeAfter(node: Node): Node | null {
  const parent = node.parentElement;

  return (
    node.nextSibling ??
    (parent?.matches(WRAPPERS) === true ? nodeAfter(parent) : null)
  );
}

function firstLeaf(node: Node | null): Node | null {
  return node instanceof Element && node.matches(WRAPPERS)
    ? firstLeaf(node.firstChild)
    : node;
}

function removeWithEmptyWrappers(node: ChildNode) {
  const parent = node.parentElement;

  node.remove();

  if (parent?.matches(WRAPPERS) === true && parent.firstChild === null) {
    removeWithEmptyWrappers(parent);
  }
}

/**
 * Removes what would stand on a line of its own after `node`. A space alone can
 * hide a hard break behind it, where a newline has already ended the line.
 */
function removeBlankLineAfter(node: Node) {
  const leaf = firstLeaf(nodeAfter(node));

  if (leaf instanceof HTMLBRElement) {
    removeWithEmptyWrappers(leaf);
  } else if (
    leaf instanceof Element &&
    leaf.matches(".ProseMirror-separator")
  ) {
    removeBlankLineAfter(leaf);
  } else if (leaf instanceof Text) {
    const endsLine = leaf.data.includes("\n");

    leaf.data = leaf.data.replace(BLANK_LINE, "");

    if (leaf.data === "") {
      if (!endsLine) {
        removeBlankLineAfter(leaf);
      }

      removeWithEmptyWrappers(leaf);
    }
  }
}

/**
 * Print returns a shown embed to `block`, where a hard break or a blank line
 * right after it would stand on an empty line of its own. A mark can wrap the
 * embed or what follows it, as a selection's span can.
 */
function removeBlankLinesAfterEmbeds(sheet: HTMLElement) {
  for (const embed of sheet.querySelectorAll(".embed[data-shown]")) {
    removeBlankLineAfter(embed);
  }
}

/** Settles once the editor's image has loaded or failed, after its node view drew the outcome. */
async function settled(image: HTMLImageElement) {
  if (image.complete) {
    return;
  }

  const listeners = new AbortController();
  const { signal } = listeners;
  const outcome = Promise.withResolvers<Event>();

  image.addEventListener("load", outcome.resolve, { signal });
  image.addEventListener("error", outcome.resolve, { signal });
  await outcome.promise;
  listeners.abort();
}

/**
 * A copy loads its image afresh with no node view listening, so one the editor
 * was still loading when it was copied takes the editor's reason if it fails.
 * An image takes its height once decoded, so measuring waits for this.
 */
async function settlePrintedImage(
  source: HTMLImageElement,
  copy: HTMLImageElement
) {
  try {
    await copy.decode();
  } catch {
    await settled(source);

    const from = source.closest<HTMLElement>("[data-image]");
    const to = copy.closest<HTMLElement>("[data-image]");
    const reason = from?.querySelector(".image-failure");

    if (from?.dataset.failed !== undefined && to !== null && reason) {
      to.dataset.failed = "";
      to.querySelector(".image-failure")?.replaceWith(reason.cloneNode(true));
    }
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
    throw new Error("The paper width is unavailable");
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

  removeBlankLinesAfterEmbeds(sheet);
  document.body.append(sheet);

  try {
    const sources = [...surface.querySelectorAll("img")];

    await Promise.all(
      [...sheet.querySelectorAll("img")].map(async (copy, index) => {
        const source = sources[index];

        if (source === undefined) {
          throw new Error("The printed copy holds an image the note does not");
        }

        await settlePrintedImage(source, copy);
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
