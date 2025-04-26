import type { Config as DaisyUIConfig } from "daisyui";
import type { Config } from "tailwindcss";

import { addDynamicIconSelectors } from "@iconify/tailwind";
import typography from "@tailwindcss/typography";
import daisyui from "daisyui";

const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  daisyui: {
    logs: false,
    prefix: "dsy-",
    themes: ["dark", "light", "night", "cyberpunk", "dim", "cmyk"],
  },
  plugins: [typography, daisyui, addDynamicIconSelectors()],
} satisfies Config & { daisyui: DaisyUIConfig };

export default config;
