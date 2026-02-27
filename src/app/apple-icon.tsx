import { ImageResponse } from "next/og";

import { ICON_PATH_DATA } from "@/lib/icon-paths";

// eslint-disable-next-line react-refresh/only-export-components -- this file is used in a non-react context, so we can't export a React component
export const size = {
  height: 180,
  width: 180,
};

// eslint-disable-next-line react-refresh/only-export-components -- this file is used in a non-react context, so we can't export a React component
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <svg
      height="180"
      viewBox="0 0 180 180"
      width="180"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#252420" height="180" width="180" />
      <g transform="translate(22.5, 22.5) scale(5.625)">
        {ICON_PATH_DATA.map((d) => {
          return (
            <path
              d={d}
              fill="none"
              key={d}
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          );
        })}
      </g>
    </svg>,
    {
      ...size,
    },
  );
}
