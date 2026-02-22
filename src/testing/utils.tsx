import type { RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import type * as React from "react";

import { render } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AllProvidersProps {
  children: React.ReactNode;
  searchParams?: Record<string, string> | string | URLSearchParams;
}

// eslint-disable-next-line react-refresh/only-export-components -- this is okay
const AllTheProviders = ({ children, searchParams }: AllProvidersProps) => {
  return (
    <NuqsTestingAdapter searchParams={searchParams}>
      <TooltipProvider>
        <Toaster />
        {children}
      </TooltipProvider>
    </NuqsTestingAdapter>
  );
};

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  searchParams?: Record<string, string> | string | URLSearchParams;
}

const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  const { searchParams, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => {
      return (
        <AllTheProviders searchParams={searchParams}>
          {children}
        </AllTheProviders>
      );
    },
    ...renderOptions,
  });
};

// eslint-disable-next-line react-refresh/only-export-components, import-x/export -- this is okay
export * from "@testing-library/react";
// eslint-disable-next-line import-x/export -- this is okay
export { customRender as render };
