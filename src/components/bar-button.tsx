import type { LucideIcon } from "lucide-react";

import { Chord } from "@/components/chord";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { useChordsByName } from "@/lib/ui/shortcuts";

interface BarButtonProps {
  className?: string;
  Icon: LucideIcon;
  /** The accessible name, the tooltip, and the registration the chords are read from. */
  label: string;
  onClick: () => void;
}

/** An icon-only ghost button in a bar, named and chorded by its tooltip. */
export function BarButton({ className, Icon, label, onClick }: BarButtonProps) {
  const chords = useChordsByName().get(label);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={className}
            onClick={onClick}
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Icon className={BAR_GLYPH} />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {chords?.map(({ hotkey, id }) => (
          <Chord hotkey={hotkey} key={id} />
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
