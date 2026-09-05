import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteError } from "./route-error";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

function mount(reason: string, retry: () => void) {
  const container = document.createElement("div");

  document.body.append(container);

  const root = createRoot(container);

  roots.push(root);
  act(() => {
    root.render(createElement(RouteError, { reason, retry }));
  });

  return container;
}

describe("RouteError", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = "";
  });

  it("should say what failed and why, and offer to try again", () => {
    const container = mount("permission denied", () => undefined);

    expect(container.textContent).toContain("could not load the workspace");
    expect(container.textContent).toContain("permission denied");
    expect(container.querySelector("button")?.textContent).toBe("try again");
  });

  it("should retry when asked", () => {
    const retry = vi.fn();
    const container = mount("permission denied", retry);

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
