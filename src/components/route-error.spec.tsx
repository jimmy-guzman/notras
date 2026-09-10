import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "./route-error";

describe("RouteError", () => {
  it("should say what failed and why, and offer to try again", () => {
    render(
      createElement(RouteError, {
        reason: "permission denied",
        retry: () => undefined,
      })
    );
    expect(
      screen.getByText("could not load the workspace")
    ).toBeInTheDocument();
    expect(screen.getByText("permission denied")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "try again" })
    ).toBeInTheDocument();
  });

  it("should retry when asked", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(createElement(RouteError, { reason: "permission denied", retry }));
    await user.click(screen.getByRole("button", { name: "try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
