import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chord } from "./chord";

describe("chord", () => {
  it("should print macOS symbols without separators", ({ onTestFinished }) => {
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("MacIntel");

    onTestFinished(() => {
      platform.mockRestore();
    });

    render(<Chord hotkey="Mod+Shift+K" />);

    expect(screen.getByText("⇧⌘k")).toBeInTheDocument();
  });

  it("should separate lowercase shortcut labels on Windows", ({
    onTestFinished,
  }) => {
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("Win32");

    onTestFinished(() => {
      platform.mockRestore();
    });

    render(<Chord hotkey="Mod+Shift+K" />);

    expect(screen.getByText("ctrl+shift+k")).toBeInTheDocument();
  });

  it("should separate lowercase shortcut labels on Linux", ({
    onTestFinished,
  }) => {
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("Linux x86_64");

    onTestFinished(() => {
      platform.mockRestore();
    });

    render(<Chord hotkey="Mod+Shift+K" />);

    expect(screen.getByText("ctrl+shift+k")).toBeInTheDocument();
  });

  it("should print a single key without a separator", () => {
    render(<Chord hotkey="Escape" />);

    expect(screen.getByText("esc")).toBeInTheDocument();
  });
});
