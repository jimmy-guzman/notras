import { ImageResponse } from "next/og";

import { ICON_PATH_DATA } from "@/lib/icon-paths";

export function GET() {
  return new ImageResponse(
    <svg
      height="512"
      viewBox="0 0 512 512"
      width="512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#252420" height="512" width="512" />
      <g transform="translate(64, 64) scale(16)">
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
      height: 512,
      width: 512,
    },
  );
}
