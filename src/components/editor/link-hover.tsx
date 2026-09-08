import { cn } from "cn";
import { PencilIcon } from "lucide-react";
import { useEffect, useRef } from "react";

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

  // Clamp inside the viewport once rendered, the same policy the link editor
  // and the suggestion menu use.
  useEffect(() => {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const margin = 8;

    element.style.left = `${Math.max(margin, Math.min(state.left, window.innerWidth - rect.width - margin))}px`;
    element.style.top = `${
      state.top + rect.height + margin > window.innerHeight
        ? Math.max(margin, state.top - rect.height - 28)
        : state.top
    }px`;
  }, [state.left, state.top]);

  return (
    // Resting the pointer here holds the panel open: it is the only way to
    // reach the button, since the pointer has to cross editor to get here.
    // biome-ignore lint/a11y/noStaticElementInteractions: hover lifetime; the button inside is the control
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover lifetime; the button inside is the control
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
