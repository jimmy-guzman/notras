import type { LucideIcon } from "lucide-react";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";

/**
 * Lucide icons for a node view, which ProseMirror builds where React cannot
 * render. They render once, so call this as the module evaluates, ahead of
 * the app's own render. The function it returns clones the named icon, and
 * throws when the icons have not rendered.
 */
export function nodeViewIcons<Name extends string>(
  icons: Record<Name, LucideIcon>
): (name: Name) => Node {
  const names = Object.keys(icons);
  const drawn = document.createElement("div");

  createRoot(drawn).render(
    createElement(
      Fragment,
      null,
      ...Object.values<LucideIcon>(icons).map((icon) =>
        createElement(icon, { size: 13 })
      )
    )
  );

  return (name) => {
    const icon = drawn.children.item(names.indexOf(name));

    if (icon === null) {
      throw new Error(`The ${name} icon did not render`);
    }

    return icon.cloneNode(true);
  };
}
