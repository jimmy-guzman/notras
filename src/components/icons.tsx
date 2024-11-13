import type { SVGProps } from "react";

export const Icons = {
  daisyUI: (props: SVGProps<SVGSVGElement>) => {
    return (
      <svg
        {...props}
        fill="none"
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>daisyUI</title>
        <rect
          fill="#1AD1A5"
          height="256"
          rx="128"
          width="512"
          x="256"
          y="670.72"
        />
        <circle cx="512" cy="353.28" fill="white" r="256" />
        <circle
          cx="512"
          cy="353.28"
          r="261"
          stroke="black"
          strokeOpacity="0.2"
          strokeWidth="10"
        />
        <circle cx="512" cy="353.28" fill="#FF9903" r="114.688" />
      </svg>
    );
  },
};
