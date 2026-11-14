import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type KeyEvent = KeyboardEvent | ReactKeyboardEvent;

// prosemirror-view's window for the same WebKit order.
const CONFIRM_WINDOW_MS = 500;

function isWebKit() {
  return /Apple Computer/u.test(navigator.vendor);
}

function isComposing(event: KeyEvent) {
  return "nativeEvent" in event
    ? event.nativeEvent.isComposing
    : event.isComposing;
}

/**
 * Keeps an input method's keys from a field's key handler: keys typed while
 * composing, and the Enter that confirms a candidate. Pass
 * `onCompositionEnd` to the field or an ancestor, and wrap its key handler
 * in `withoutImeKeys`.
 */
export function useImeKeys() {
  const compositionEndedAt = useRef(Number.NEGATIVE_INFINITY);

  const onCompositionEnd = (event: { timeStamp: number }) => {
    // WebKit, WebKitGTK included, sends the confirming keydown after
    // compositionend, in no fixed task. Chromium sends it before, marked
    // isComposing, so a window there would swallow the next real key.
    if (isWebKit()) {
      compositionEndedAt.current = event.timeStamp;
    }
  };

  const withoutImeKeys =
    <E extends KeyEvent>(handle: (event: E) => void) =>
    (event: E) => {
      if (isComposing(event)) {
        return;
      }

      if (event.timeStamp - compositionEndedAt.current < CONFIRM_WINDOW_MS) {
        compositionEndedAt.current = Number.NEGATIVE_INFINITY;

        return;
      }

      handle(event);
    };

  return { onCompositionEnd, withoutImeKeys };
}
