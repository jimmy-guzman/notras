import "@/styles.css";

import { CSPProvider } from "@base-ui/react/csp-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app-shell";
import { styleNonce } from "@/lib/style-nonce";

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
