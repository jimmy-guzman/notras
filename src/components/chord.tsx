import { Kbd } from "@/components/ui/kbd";
import { chordGlyph } from "@/lib/ui/shortcuts";

interface ChordProps {
  className?: string;
  /** A registered hotkey, e.g. `Mod+Shift+Y`, drawn for the running platform. */
  hotkey: string;
}

/** One chord, one box. */
export function Chord({ className, hotkey }: ChordProps) {
  return <Kbd className={className}>{chordGlyph(hotkey)}</Kbd>;
}
