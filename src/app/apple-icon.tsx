import { ImageResponse } from "next/og";

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
        <path
          d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 6h4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 10h4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 14h4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 18h4"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </g>
    </svg>,
    {
      ...size,
    },
  );
}
