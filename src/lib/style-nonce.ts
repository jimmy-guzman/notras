// Tauri authorizes the launch stylesheet with a nonce in packaged builds.
// Runtime styles need that same nonce; the development page has none.
export const styleNonce = document.querySelector<HTMLStyleElement>(
  "head > style[nonce]"
)?.nonce;
