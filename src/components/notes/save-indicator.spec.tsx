import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveIndicator } from "./save-indicator";

describe("SaveIndicator", () => {
  it("should read needs review with its reason while a note waits on a review", () => {
    render(<SaveIndicator reason="the disk is full" status="conflict" />);
    expect(
      screen.getByText("needs review: the disk is full")
    ).toBeInTheDocument();
  });
});
