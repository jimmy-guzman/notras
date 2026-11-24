import {
  FolderIcon,
  HashIcon,
  PinIcon,
  RotateCcwClockIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { NOTE_BROWSER_MODES } from "@/lib/ui/note-browser";
import type { NoteBrowserMode } from "@/lib/ui/note-browser";

const BUTTONS = {
  folders: { Icon: FolderIcon, hotkey: "Mod+Alt+1", label: "browse folders" },
  history: {
    Icon: RotateCcwClockIcon,
    hotkey: "Mod+Alt+3",
    label: "browse history",
  },
  pinned: { Icon: PinIcon, hotkey: "Mod+Alt+4", label: "browse pinned" },
  tags: { Icon: HashIcon, hotkey: "Mod+Alt+2", label: "browse tags" },
} as const satisfies Record<
  NoteBrowserMode,
  { Icon: LucideIcon; hotkey: string; label: string }
>;

/** A button for each of the browser's modes, in order. A label is also the name its chord registers under. */
export const NOTE_BROWSER_BUTTONS = NOTE_BROWSER_MODES.map((mode) => ({
  ...BUTTONS[mode],
  mode,
}));
