import { describe, expect, it } from "vitest";
import { errorMessage } from "./failure";

describe("errorMessage", () => {
  it("should return the error's own message", () => {
    expect(errorMessage(new Error("disk is full"), "could not save")).toBe(
      "disk is full"
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
