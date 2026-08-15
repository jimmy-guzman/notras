import { createRouter, RouterProvider } from "@tanstack/react-router";

import { CaptureWindow } from "@/components/capture-window";
import { routeTree } from "@/routeTree.gen";

const router = createRouter({
  defaultPreload: "intent",
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const isCaptureWindow = new URLSearchParams(globalThis.location.search).has(
  "window",
);

export function App() {
  if (isCaptureWindow) {
    return <CaptureWindow />;
  }

  return <RouterProvider router={router} />;
}
