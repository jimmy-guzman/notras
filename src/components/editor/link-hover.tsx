import { cn } from "cn";
import { PencilIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { clampToViewport } from "./clamp-to-viewport";

export interface LinkHoverState {
  editable: boolean;
  /** Rect of the link being pointed at, for placing the panel under it. */
  left: number;
  /** Where it lands, or the reason it lands nowhere. */
  missing: boolean;
  /** A position inside the link, so editing acts on it and not on the caret. */
  pos: number;
  /** Set for a wikilink, whose title is the thing to edit. */
  title: null | string;
  top: number;
  url: string;
}

interface LinkHoverProps {
  onEdit: () => void;
  onPointerLeave: () => void;
  onPointerOver: () => void;
  state: LinkHoverState;
}

/** Where a link goes, shown while the pointer is on it, and the way to change it. */
export function LinkHover({
  onEdit,
  onPointerLeave,
  onPointerOver,
  state,
}: LinkHoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;

    if (element !== null) {
      clampToViewport(element, state.left, state.top);
    }
  }, [state.left, state.top]);

  return (
    // Resting the pointer here holds the panel open: it is the only way to
    // reach the button, since the pointer has to cross editor to get here.
    <div
      className="link-hover"
      onMouseEnter={onPointerOver}
      onMouseLeave={onPointerLeave}
      ref={containerRef}
    >
      <span
        className={cn("link-hover-url", state.missing && "link-hover-missing")}
      >
        {state.url}
      </span>
      {state.editable ? (
        <button
          aria-label="edit link"
          className="code-block-button"
          onClick={onEdit}
          type="button"
        >
          <PencilIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
