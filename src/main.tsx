import "@/styles.css";
import { CSPProvider } from "@base-ui/react/csp-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
import { styleNonce } from "@/lib/style-nonce";

if (import.meta.env.MODE === "smoke") {
  await import("@wdio/tauri-plugin");
}

const root = document.querySelector("#root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <CSPProvider nonce={styleNonce}>
        <App />
      </CSPProvider>
    </StrictMode>
  );
}
