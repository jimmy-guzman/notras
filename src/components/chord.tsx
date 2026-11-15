import { detectPlatform, useFormatForDisplay } from "@tanstack/react-hotkeys";
import type { HotkeyChord } from "@tanstack/react-hotkeys";

import { Kbd } from "@/components/ui/kbd";

interface ChordProps {
  /** A registered hotkey, e.g. `Mod+Shift+Y`, drawn for the running platform. */
  hotkey: HotkeyChord;
}

/** One chord, one box. */
export function Chord({ hotkey }: ChordProps) {
  const formatForDisplay = useFormatForDisplay();
  const platform = detectPlatform();

  return (
    <Kbd>
      {formatForDisplay(hotkey, {
        platform,
        separatorToken: platform === "mac" ? "" : "+",
      }).toLowerCase()}
    </Kbd>
  );
}
