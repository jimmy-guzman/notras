import { createStore, useSelector } from "@tanstack/react-store";

/** Outside the strip, since the palette opens the list too. */
const tabList = createStore({ open: false });

export function useTabListOpen() {
  return useSelector(tabList, (state) => state.open);
}

export function setTabListOpen(open: boolean) {
  tabList.setState(() => ({ open }));
}
