/** @type {import("prettier").Options} */
const config = {
  semi: false,
  singleQuote: true,
  printWidth: 80,
  jsxSingleQuote: true,
  arrowParens: 'always',
  trailingComma: 'es5',
  quoteProps: 'consistent',
  plugins: ['prettier-plugin-tailwindcss'],
  overrides: [
    {
      files: 'pnpm-lock.yaml',
      options: {
        rangeEnd: 0,
      },
    },
  ],
}

export default config
