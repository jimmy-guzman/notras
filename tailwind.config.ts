import { addDynamicIconSelectors } from '@iconify/tailwind'
import typography from '@tailwindcss/typography'
import daisyui, { type Config as DaisyUIConfig } from 'daisyui'
import type { Config } from 'tailwindcss'

const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  daisyui: {
    themes: ['dark', 'light', 'night', 'cyberpunk', 'dim', 'cmyk'],
    prefix: 'dsy-',
    logs: false,
  },
  plugins: [typography, daisyui, addDynamicIconSelectors()],
} satisfies Config & { daisyui: DaisyUIConfig }

export default config
