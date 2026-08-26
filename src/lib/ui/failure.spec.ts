import { describe, expect, it } from "vitest";
import { errorMessage } from "./failure";

describe("errorMessage", () => {
  it("should return the error's own message", () => {
    expect(errorMessage(new Error("disk is full"), "could not save")).toBe(
      "disk is full"
    );
  });

  it("should return the fallback when the error carries no message", () => {
    // biome-ignore lint/suspicious/useErrorMessage: the blank message is the case under test, and it reaches the app from Rust rather than from a `new Error` lint can see
    expect(errorMessage(new Error("   "), "could not save")).toBe(
      "could not save"
    );
  });

  // A Tauri command rejects with whatever Rust returns, so the fallback branch
  // is the one the app reaches most.
  it("should return the fallback when the rejection is not an error", () => {
    expect(errorMessage("write failed", "could not save")).toBe(
      "could not save"
    );
  });
});
