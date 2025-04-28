import type { SVGProps } from "react";

export const Icons = {
  logo: (props: SVGProps<SVGSVGElement>) => {
    return (
      <svg
        {...props}
        fill="none"
        viewBox="0 0 120 50"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>notras</title>
        <g transform="translate(20,25)">
          <circle cx="0" cy="0" fill="currentColor" r="4" />
          <circle
            cx="0"
            cy="0"
            opacity="0.5"
            r="9"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle
            cx="0"
            cy="0"
            opacity="0.3"
            r="14"
            stroke="currentColor"
            strokeWidth="1"
          />
        </g>

        <text
          fill="currentColor"
          fontFamily="Inter, sans-serif"
          fontSize="20"
          fontWeight="600"
          letterSpacing="0.25"
          x="45"
          y="30"
        >
          notras
        </text>
      </svg>
    );
  },
};
