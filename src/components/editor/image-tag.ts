import { Lexer } from "marked";

const TAG = Lexer.rules.inline.gfm.tag;
const ALLOWED_ATTRIBUTES = new Set(["alt", "src", "title", "width"]);
const WIDTH = /^[1-9]\d*$/u;

export interface ImageTag {
  alt: string;
  src: string;
  title: string | null;
  width: number | null;
}

/**
 * The image an `<img>` tag describes, when the editor can draw it as one and
 * write it back without losing anything: one complete tag carrying only
 * `src`, `alt`, `title` and a whole positive `width`. Any other tag is the
 * author's HTML and stays code. `crates/notras-core/src/markdown.rs` applies
 * the same rule to the search body, and `fixtures/image-tags.json` holds the
 * cases both sides pass.
 */
export function imageTagAttrs(html: string): ImageTag | null {
  const tag = TAG.exec(html)?.[0];

  if (tag === undefined || tag.length !== html.length) {
    return null;
  }

  const element = new DOMParser().parseFromString(html, "text/html").body
    .firstElementChild;

  if (
    element === null ||
    element.localName !== "img" ||
    element.nextSibling !== null ||
    !element.hasAttribute("src") ||
    !element.getAttributeNames().every((name) => ALLOWED_ATTRIBUTES.has(name))
  ) {
    return null;
  }

  const width = element.getAttribute("width");

  if (width !== null && !WIDTH.test(width)) {
    return null;
  }

  return {
    alt: element.getAttribute("alt") ?? "",
    src: element.getAttribute("src") ?? "",
    title: element.getAttribute("title"),
    width: width === null ? null : Number(width),
  };
}

/** The image tag `src` opens with, for a tokenizer standing at a `<`. */
export function imageTagAt(src: string) {
  const raw = TAG.exec(src)?.[0];
  const image = raw === undefined ? null : imageTagAttrs(raw);

  return raw === undefined || image === null ? null : { image, raw };
}

/** The tag `imageTagAttrs` reads back to the same image, attributes in one fixed order. */
export function imageTag({ alt, src, title, width }: ImageTag) {
  const element = document.createElement("img");

  element.setAttribute("src", src);
  element.setAttribute("alt", alt);
  if (title !== null) {
    element.setAttribute("title", title);
  }
  if (width !== null) {
    element.setAttribute("width", String(width));
  }

  return element.outerHTML;
}
