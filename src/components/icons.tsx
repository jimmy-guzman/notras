import type { SVGProps } from "react";

export const Icons = {
  logo: (props: SVGProps<SVGSVGElement>) => {
    return (
      <svg
        {...props}
        fill="none"
        viewBox="0 0 220 50"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>notras</title>
        <g transform="translate(25,25)">
          <circle cx="0" cy="0" fill="currentColor" r="3" />
          <circle
            cx="0"
            cy="0"
            opacity="0.5"
            r="8"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle
            cx="0"
            cy="0"
            opacity="0.3"
            r="13"
            stroke="currentColor"
            strokeWidth="1"
          />
        </g>

        <text
          fill="currentColor"
          fontFamily="Inter, sans-serif"
          fontSize="24"
          letterSpacing="0.5"
          x="55"
          y="32"
        >
          notras
        </text>
      </svg>
    );
  },
};
