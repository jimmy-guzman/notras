import type { NodeViewRenderer } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { ImageOffIcon, Maximize2Icon } from "lucide-react";
import { Fragment, createElement } from "react";
import { createRoot } from "react-dom/client";

import { hasNumber, hasString } from "@/components/editor/attrs";

const MIN_WIDTH = 64;

// ProseMirror builds the node where React cannot render, so the icons render
// once as the module evaluates and are cloned into each image.
const icons = document.createElement("div");

createRoot(icons).render(
  createElement(
    Fragment,
    null,
    createElement(Maximize2Icon, { size: 13 }),
    createElement(ImageOffIcon, { size: 13 })
  )
);

function icon(index: number) {
  const drawn = icons.children.item(index);

  if (drawn === null) {
    throw new Error("The image icon did not render");
  }

  return drawn.cloneNode(true);
}

/** Where an image loads from, or null when it is refused, and what its place says when it does not show. */
export interface ImageSource {
  failure: string;
  src: string | null;
}

interface Resize {
  available: number;
  moved: boolean;
  pointerId: number;
  startWidth: number;
  startX: number;
}

function widthAt({ available, startWidth, startX }: Resize, clientX: number) {
  return Math.min(
    Math.max(MIN_WIDTH, startWidth + clientX - startX),
    available
  );
}

function srcOf(attrs: Node["attrs"]) {
  return hasString(attrs, "src") ? attrs.src : "";
}

function showFailure(dom: HTMLElement, reason: HTMLElement, failure: string) {
  dom.dataset.failed = "";
  reason.textContent = failure;
}

function applyAttributes(
  dom: HTMLElement,
  image: HTMLImageElement,
  reason: HTMLElement,
  attrs: Node["attrs"],
  resolveSrc: (src: string) => ImageSource
) {
  const { failure, src } = resolveSrc(srcOf(attrs));
  const width = hasNumber(attrs, "width") ? attrs.width : null;

  if (src === null) {
    image.removeAttribute("src");
    delete image.dataset.loaded;
    showFailure(dom, reason, failure);
  } else if (image.getAttribute("src") !== src) {
    // Only a new src loads: reassigning an unchanged one restarts the load and blinks the image.
    delete image.dataset.loaded;
    delete dom.dataset.failed;
    reason.textContent = "";
    image.src = src;
  }

  image.alt = hasString(attrs, "alt") ? attrs.alt : "";
  image.title = hasString(attrs, "title") ? attrs.title : "";
  image.style.width = width === null ? "" : `${width}px`;

  if (width === null) {
    image.removeAttribute("width");
  } else {
    image.setAttribute("width", String(width));
  }
}

/**
 * The image with a handle on its right edge while it is selected. Only the
 * width is kept: a width alone keeps the ratio in every renderer, so the
 * stylesheet derives the height. The handle owns its pointer the way
 * `DragSelectionView` owns a drag, through capture, and stops the press before
 * that view hears it, so one press is one drag. The width is clamped at the
 * source to what the line can show, so the number stored is the one seen. A
 * toolbar shows on hover with the one action an image has, the way a code
 * block shows copy, so the double-click has something to teach it. An image
 * that is refused or fails to load shows why in its place.
 */
export function imageNodeView(
  resolveSrc: (src: string) => ImageSource,
  openImage: ((image: HTMLImageElement) => void) | null
): NodeViewRenderer {
  return ({ getPos, node: mounted, view }) => {
    const dom = document.createElement("span");
    const image = document.createElement("img");
    const toolbar = document.createElement("div");
    const open = document.createElement("button");
    const handle = document.createElement("div");
    const failure = document.createElement("span");
    const reason = document.createElement("span");
    const listeners = new AbortController();
    const { signal } = listeners;
    let node = mounted;
    let resize: Resize | null = null;

    dom.dataset.image = "";
    image.draggable = false;
    toolbar.className = "image-toolbar";
    toolbar.contentEditable = "false";
    open.type = "button";
    open.className = "code-block-button";
    open.setAttribute("aria-label", "open image");
    open.append(icon(0), "open");
    toolbar.append(open);
    handle.className = "image-handle";
    failure.className = "image-failure";
    failure.contentEditable = "false";
    failure.append(icon(1), reason);
    dom.append(image, failure, toolbar, handle);
    applyAttributes(dom, image, reason, node.attrs, resolveSrc);

    const markLoaded = () => {
      image.dataset.loaded = "";
    };

    image.addEventListener("load", markLoaded, { signal });
    image.addEventListener(
      "error",
      () => {
        showFailure(dom, reason, resolveSrc(srcOf(node.attrs)).failure);
      },
      { signal }
    );

    // A cached image is complete before the listener attached.
    if (image.complete && image.naturalWidth > 0) {
      markLoaded();
    }

    open.addEventListener(
      "click",
      () => {
        openImage?.(image);
      },
      { signal }
    );
    handle.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || !event.isPrimary) {
          return;
        }

        // The default would start the native drag of the selected node, and
        // the editor's own drag listens one level up.
        event.preventDefault();
        event.stopPropagation();

        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // no capture, so the pointer has to stay over the handle
        }

        resize = {
          available: dom.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY,
          moved: false,
          pointerId: event.pointerId,
          startWidth: image.getBoundingClientRect().width,
          startX: event.clientX,
        };
        dom.dataset.resizing = "";
      },
      { signal }
    );
    handle.addEventListener(
      "pointermove",
      (event) => {
        if (resize !== null && event.pointerId === resize.pointerId) {
          resize.moved = true;
          image.style.width = `${widthAt(resize, event.clientX)}px`;
        }
      },
      { signal }
    );

    // A press that never moved, or a pointer the system took back, writes
    // nothing and the image goes back to what the doc says.
    const end = (event: PointerEvent) => {
      if (resize === null || event.pointerId !== resize.pointerId) {
        return;
      }

      const { moved } = resize;
      const width = Math.round(widthAt(resize, event.clientX));
      const pos = getPos();

      resize = null;
      delete dom.dataset.resizing;

      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }

      if (!moved || event.type === "pointercancel" || pos === undefined) {
        applyAttributes(dom, image, reason, node.attrs, resolveSrc);

        return;
      }

      const tr = view.state.tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        width,
      });

      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    };

    handle.addEventListener("pointerup", end, { signal });
    handle.addEventListener("pointercancel", end, { signal });

    return {
      destroy: () => {
        listeners.abort();
      },
      dom,
      // Every mutation under the wrapper is this view's own style and data writes.
      ignoreMutation: () => true,
      stopEvent: (event) =>
        event.target === handle ||
        (event.target instanceof globalThis.Node &&
          toolbar.contains(event.target)),
      update: (updated) => {
        if (updated.type !== node.type) {
          return false;
        }

        node = updated;
        applyAttributes(dom, image, reason, node.attrs, resolveSrc);

        return true;
      },
    };
  };
}
