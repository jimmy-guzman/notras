import { ImageResponse } from "next/og";

import { ICON_PATH_DATA } from "@/lib/icon-paths";

export function GET() {
  return new ImageResponse(
    <svg
      height="32"
      viewBox="0 0 32 32"
      width="32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#252420" height="32" width="32" />
      <g transform="translate(4, 4)">
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
      height: 32,
      width: 32,
    },
  );
}
