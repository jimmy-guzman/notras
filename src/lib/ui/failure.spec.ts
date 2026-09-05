import { describe, expect, it } from "vitest";
import { reasonOf } from "./failure";

describe("reasonOf", () => {
  it("should return the error's message", () => {
    expect(reasonOf(new Error("disk is full"))).toBe("disk is full");
  });

  it("should return nothing when the error's message is blank", () => {
    // biome-ignore lint/suspicious/useErrorMessage: the blank message is the case under test, and it reaches the app from Rust rather than from a `new Error` lint can see
    expect(reasonOf(new Error("   "))).toBeUndefined();
  });

  // A Tauri command rejects with whatever Rust returns, so this branch is the
  // one the app reaches when a command fails before it runs.
  it("should return nothing when the rejection is not an error", () => {
    expect(reasonOf("write failed")).toBeUndefined();
  });
});
