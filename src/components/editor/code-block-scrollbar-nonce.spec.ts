import { act } from "react";
import { describe, expect, it } from "vitest";

// Its own file, because React keeps the first copy of the shared style it
// mounts, and a module that imported the scrollbar earlier would have mounted
// it before the launch stylesheet below existed.
describe("code block scrollbar nonce", () => {
  it("should give the scrollbar-hiding style the launch stylesheet's nonce", async () => {
    const launch = document.createElement("style");
    launch.setAttribute("nonce", "launch");
    // happy-dom has no nonce property, and the app reads the nonce through it.
    Object.defineProperty(launch, "nonce", { value: "launch" });
    document.head.append(launch);

    await act(async () => {
      await import("./code-block-scrollbar");
    });

    expect(
      document.head.querySelector(
        'style[data-href="base-ui-disable-scrollbar"]'
      )
    ).toHaveAttribute("nonce", "launch");
  });
});
