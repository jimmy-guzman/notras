import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// The keyCode a browser gives a keydown its input method processed.
const IME_KEY_CODE = 229;

/**
 * Whether an input method owns the key: one typed while composing, or the
 * Enter that confirms a candidate. A field's key handler returns early on it.
 */
export function isImeKey(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = "nativeEvent" in event ? event.nativeEvent : event;

  // oxlint-disable-next-line typescript/no-deprecated -- WebKit clears isComposing before the confirming keydown, and only keyCode still marks it, as prosemirror-view relies on
  return native.isComposing || native.keyCode === IME_KEY_CODE;
}
