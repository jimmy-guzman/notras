import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import type { DialogHandle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BAR_GLYPH } from "@/lib/ui/bar";
import { useChordsByName } from "@/lib/ui/shortcuts";

import { Chord } from "./chord";

type BarButtonProps = {
  /**
   * For a button that shows and hides a panel: whether the panel is showing.
   * Told to assistive tech only; the panel itself shows it on screen.
   */
  pressed?: boolean;
  Icon: LucideIcon;
  /** The accessible name, the tooltip, and the registration the chords are read from. */
  label: string;
} & (
  | { onClick: () => void; opens?: never }
  /** A dialog the button opens, and closes again while it is open. */
  | { onClick?: never; opens: DialogHandle }
);

/** An icon-only ghost button in a bar, named and chorded by its tooltip. */
export function BarButton({
  Icon,
  label,
  onClick,
  opens,
  pressed,
}: BarButtonProps) {
  const chords = useChordsByName().get(label);

  const button = (
    <Button
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      size="icon-xs"
      variant="ghost"
    />
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          opens === undefined ? (
            button
          ) : (
            <DialogTrigger handle={opens} render={button} />
          )
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
