import type { HotkeyChord } from "@tanstack/react-hotkeys";

import { Kbd } from "@/components/ui/kbd";
import { chordGlyph } from "@/lib/ui/shortcuts";

interface ChordProps {
  /** A registered hotkey, e.g. `Mod+Shift+Y`, drawn for the running platform. */
  hotkey: HotkeyChord;
}

/** One chord, one box. */
export function Chord({ hotkey }: ChordProps) {
  return <Kbd>{chordGlyph(hotkey)}</Kbd>;
}
