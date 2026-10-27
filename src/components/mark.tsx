import { cn } from "cn";
import { useId } from "react";

/** `assets/icon.svg`'s lines at the large tier. */
const LINES = "M18 68H118M18 92H98M18 116H70";

/** The icon's face in its sunset ink. No tile: inside the app the window is the tile. */
export function Mark({
  blinking = false,
  expression = "awake",
  size,
}: {
  /** The welcome mark blinks; a mark beside a list holds still. */
  blinking?: boolean;
  expression?: "awake" | "meh";
  size: number;
}) {
  const gradient = useId();

  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="11.5 17 113 113"
      width={size}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradient}
          x1="0"
          x2="0"
          y1="24"
          y2="116"
        >
          <stop stopColor="var(--primary)" />
          <stop offset=".5" stopColor="var(--syntax-keyword-import)" />
          <stop offset="1" stopColor="var(--info)" />
        </linearGradient>
      </defs>
      {expression === "meh" ? (
        <path
          d="M36 38H48M88 38H100"
          fill="none"
          stroke={`url("#${gradient}")`}
          strokeLinecap="round"
          strokeWidth="13"
        />
      ) : (
        <g
          className={cn(blinking && "mark-blinking")}
          fill={`url("#${gradient}")`}
        >
          <circle cx="42" cy="32" r="8" />
          <circle cx="94" cy="32" r="8" />
        </g>
      )}
      <path
        d={LINES}
        fill="none"
        stroke={`url("#${gradient}")`}
        strokeLinecap="round"
        strokeWidth="13"
      />
    </svg>
  );
}
