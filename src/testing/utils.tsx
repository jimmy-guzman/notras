import type { RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import type * as React from "react";

import { render } from "@testing-library/react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// eslint-disable-next-line react-refresh/only-export-components -- this is okay
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <TooltipProvider>
      <Toaster />
      {children}
    </TooltipProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) => render(ui, { wrapper: AllTheProviders, ...options });

// eslint-disable-next-line react-refresh/only-export-components, import-x/export -- this is okay
export * from "@testing-library/react";
// eslint-disable-next-line import-x/export -- this is okay
export { customRender as render };
