import { useId } from "react";

/** The tile and the lines of `assets/icon.svg`, at its large tier. */
const TILE =
  "M152.50 68C152.50 27.90 153.81 6.68 141.56 -5.56C129.32 -17.81 108.10 -16.50 68 -16.50C27.90 -16.50 6.68 -17.81 -5.56 -5.56C-17.81 6.68 -16.50 27.90 -16.50 68C-16.50 108.10 -17.81 129.32 -5.56 141.56C6.68 153.81 27.90 152.50 68 152.50C108.10 152.50 129.32 153.81 141.56 141.56C153.81 129.32 152.50 108.10 152.50 68Z";

const LINES = "M18 68H118M18 92H98M18 116H70";

/**
 * The icon drawn in the app from the same geometry as `assets/icon.svg`, on
 * the live tokens, so it follows the scheme and its eyes can move.
 */
export function Mark({
  blinking = false,
  size,
}: {
  /** The welcome mark blinks; a mark beside a list holds still. */
  blinking?: boolean;
  size: number;
}) {
  const gradient = useId();

  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="-16.5 -16.5 169 169"
      width={size}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradient}
          x1="0"
          x2="0"
          y1="-16.5"
          y2="152.5"
        >
          <stop stopColor="var(--primary)" />
          <stop offset=".5" stopColor="var(--syntax-keyword-import)" />
          <stop offset="1" stopColor="var(--info)" />
        </linearGradient>
      </defs>
      <path d={TILE} fill={`url("#${gradient}")`} />
      <g
        className={blinking ? "mark-blinking" : undefined}
        fill="var(--background)"
      >
        <circle cx="42" cy="32" r="8" />
        <circle cx="94" cy="32" r="8" />
      </g>
      <path
        d={LINES}
        fill="none"
        stroke="var(--background)"
        strokeLinecap="round"
        strokeWidth="13"
      />
    </svg>
  );
}
