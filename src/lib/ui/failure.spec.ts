import { describe, expect, it } from "vitest";
import { reasonOf } from "./failure";

describe("reasonOf", () => {
  it("should return the trimmed reason from a serialized native failure", () => {
    expect(reasonOf({ kind: "failed", message: "  permission denied  " })).toBe(
      "permission denied"
    );
  });

  it("should return the reason from a serialized missing-file failure", () => {
    expect(reasonOf({ kind: "not-found", message: "no such file" })).toBe(
      "no such file"
    );
  });

  it("should return nothing when a serialized native reason is blank", () => {
    expect(reasonOf({ kind: "failed", message: "   " })).toBeUndefined();
  });

  it("should return nothing for values without a recognized error message", () => {
    expect(reasonOf(null)).toBeUndefined();
    expect(reasonOf(undefined)).toBeUndefined();
    expect(reasonOf({ message: "unclassified" })).toBeUndefined();
    expect(reasonOf({ kind: "failed", message: 42 })).toBeUndefined();
  });

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
