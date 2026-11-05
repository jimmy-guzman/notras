import { describe, expect, it } from "vitest";

import { reasonOf } from "./failure";

describe(reasonOf, () => {
  it("should return the trimmed reason from a serialized native failure", () => {
    expect(reasonOf({ kind: "failed", message: "  Permission denied  " })).toBe(
      "Permission denied"
    );
  });

  it("should return the reason from a serialized missing-file failure", () => {
    expect(reasonOf({ kind: "not-found", message: "No such file" })).toBe(
      "No such file"
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
    expect(reasonOf(new Error("   "))).toBeUndefined();
  });

  // Tauri rejects with a bare string when a command fails before it runs,
  // because its arguments did not parse.
  it("should return the trimmed reason from a bare string rejection", () => {
    expect(reasonOf("  write failed  ")).toBe("write failed");
  });

  it("should return nothing when a bare string rejection is blank", () => {
    expect(reasonOf("   ")).toBeUndefined();
  });
});
