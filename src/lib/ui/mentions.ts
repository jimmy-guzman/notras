import { createStore, useSelector } from "@tanstack/react-store";

/**
 * The palette opens the list too, and it renders in a different tree from
 * the strip, so the open state sits beside neither.
 */
const mentions = createStore({ open: false });

export function useMentionsOpen() {
  return useSelector(mentions, (state) => state.open);
}

export function setMentionsOpen(open: boolean) {
  mentions.setState(() => ({ open }));
}
