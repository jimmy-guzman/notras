import type { NodeViewRenderer } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { Maximize2Icon } from "lucide-react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { hasNumber, hasString } from "@/components/editor/attrs";

const MIN_WIDTH = 64;

// ProseMirror builds the node where React cannot render, so the icon renders
// once as the module evaluates and is cloned into each image.
const icons = document.createElement("div");
createRoot(icons).render(createElement(Maximize2Icon, { size: 13 }));

function openIcon() {
  const drawn = icons.firstElementChild;
  if (drawn === null) {
    throw new Error("The image icon did not render");
  }

  return drawn.cloneNode(true);
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

function applyAttributes(
  image: HTMLImageElement,
  attrs: Node["attrs"],
  resolveSrc: (src: string) => string
) {
  const src = resolveSrc(hasString(attrs, "src") ? attrs.src : "");
  const width = hasNumber(attrs, "width") ? attrs.width : null;

  // Reassigning an unchanged src still restarts the load and blinks the image.
  if (image.getAttribute("src") !== src) {
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
 * block shows copy, so the double-click has something to teach it.
 */
export function imageNodeView(
  resolveSrc: (src: string) => string,
  openImage: ((image: HTMLImageElement) => void) | null
): NodeViewRenderer {
  return ({ getPos, node: mounted, view }) => {
    const dom = document.createElement("span");
    const image = document.createElement("img");
    const toolbar = document.createElement("div");
    const open = document.createElement("button");
    const handle = document.createElement("div");
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
    open.append(openIcon(), "open");
    toolbar.append(open);
    handle.className = "image-handle";
    dom.append(image, toolbar, handle);
    applyAttributes(image, node.attrs, resolveSrc);

    const markLoaded = () => {
      image.dataset.loaded = "";
    };

    image.addEventListener("load", markLoaded, { signal });
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
    // The editor's drag listens one level up and would take the press of a
    // selected image's button, and with it the click.
    toolbar.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
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
        applyAttributes(image, node.attrs, resolveSrc);

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
        applyAttributes(image, node.attrs, resolveSrc);

        return true;
      },
    };
  };
}
