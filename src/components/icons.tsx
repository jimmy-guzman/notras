import { type SVGProps } from "react";

export const Icons = {
  daisyUI: (props: SVGProps<SVGSVGElement>) => {
    return (
      <svg
        {...props}
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>daisyUI</title>
        <rect
          x="256"
          y="670.72"
          width="512"
          height="256"
          rx="128"
          fill="#1AD1A5"
        />
        <circle cx="512" cy="353.28" r="256" fill="white" />
        <circle
          cx="512"
          cy="353.28"
          r="261"
          stroke="black"
          strokeOpacity="0.2"
          strokeWidth="10"
        />
        <circle cx="512" cy="353.28" r="114.688" fill="#FF9903" />
      </svg>
    );
  },
};
