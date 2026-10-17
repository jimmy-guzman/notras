import { cn } from "cn";
import { RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEP = 1.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

interface ViewerDialogProps {
  /** The content at the full width of its box. */
  children: ReactNode;
  onClosed: () => void;
  /** `card` draws the content on the fence's card, for a drawing whose inks are derived for it. */
  surface: "card" | "none";
  title: string;
  /** The content's size at 1x, in CSS pixels. */
  width: number;
}

/** Zooms by a pinch, which WebKit delivers as a wheel with ctrl held. */
function pinchHandler(zoomBy: (factor: number) => void) {
  return (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY / 100));
    }
  };
}

/**
 * Fills the window below the title bar, less a 2rem gutter, with one thing
 * alone at its size,
 * centered when it fits and scrolling when it does not, with zoom in, zoom
 * out and reset as buttons, as ⌘=, ⌘- and ⌘0, and as a pinch. It opens on
 * mount and reports once its close has played.
 */
function ViewerDialog({
  children,
  onClosed,
  surface,
  title,
  width,
}: ViewerDialogProps) {
  const [open, setOpen] = useState(true);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Holds the view's center through a zoom, so what was being read stays
  // put. The center is taken in the content's own coordinates, since the
  // grid centers content that fits and the card pads it.
  const zoomTo = (next: number) => {
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const box = boxRef.current;
    const content = contentRef.current;

    if (box === null || content === null) {
      return;
    }

    const ratio = target / scale;
    const frame = box.getBoundingClientRect();
    const centerX = frame.left + box.clientWidth / 2;
    const centerY = frame.top + box.clientHeight / 2;
    const before = content.getBoundingClientRect();
    const x = centerX - before.left;
    const y = centerY - before.top;

    flushSync(() => {
      setScale(target);
    });

    const after = content.getBoundingClientRect();
    box.scrollBy(
      after.left + x * ratio - centerX,
      after.top + y * ratio - centerY
    );
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
      }}
      onOpenChangeComplete={(settled) => {
        if (!settled) {
          onClosed();
        }
      }}
      open={open}
    >
      <DialogContent
        className={cn(
          "top-12 left-8 flex h-[calc(100vh-5rem)] w-[calc(100vw-4rem)] max-w-none translate-x-0 translate-y-0 p-0 ring-0 sm:max-w-none",
          surface === "card"
            ? "bg-card rounded-md"
            : "bg-transparent shadow-none"
        )}
        // The frame takes focus, so the arrow keys, Page Up and Down and
        // Space pan it the way they scroll any focused box.
        initialFocus={boxRef}
        // The editor takes focus back itself once the close has played, with
        // the note's scroll offset kept. A focus the dialog returned would
        // scroll the note, since WebKit ignores `preventScroll` there.
        finalFocus={false}
        // The bare surface fills the window too, so a click on the frame
        // beside the content is the click outside the dialog that closes it.
        onClick={(event) => {
          if (
            surface === "none" &&
            event.target instanceof Node &&
            boxRef.current?.contains(event.target) === true &&
            contentRef.current?.contains(event.target) === false
          ) {
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey)) {
            return;
          }
          const zoom = {
            "+": scale * STEP,
            "-": scale / STEP,
            "0": 1,
            "=": scale * STEP,
          }[event.key];
          if (zoom !== undefined) {
            event.preventDefault();
            zoomTo(zoom);
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto outline-none",
            surface === "card" && "p-4"
          )}
          tabIndex={-1}
          // React's own wheel listener is passive, so it could not keep the
          // page from zooming along with the content.
          ref={(box) => {
            boxRef.current = box;
            const onWheel = pinchHandler((factor) => {
              zoomTo(scale * factor);
            });
            box?.addEventListener("wheel", onWheel, { passive: false });

            return () => {
              box?.removeEventListener("wheel", onWheel);
            };
          }}
        >
          <div className="grid min-h-full min-w-full place-items-center">
            <div
              className="w-(--viewer-width)"
              data-slot="viewer-content"
              ref={contentRef}
              style={{ "--viewer-width": `${width * scale}px` }}
            >
              {children}
            </div>
          </div>
        </div>
        <div className="bg-popover absolute right-2 bottom-2 flex gap-0.5 rounded-lg p-0.5">
          <Button
            aria-label="zoom out"
            disabled={scale <= MIN_SCALE}
            onClick={() => {
              zoomTo(scale / STEP);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomOutIcon />
          </Button>
          <Button
            aria-label="zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => {
              zoomTo(scale * STEP);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <ZoomInIcon />
          </Button>
          <Button
            aria-label="reset zoom"
            disabled={scale === 1}
            onClick={() => {
              zoomTo(1);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <RotateCcwIcon />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ViewerDialog };
