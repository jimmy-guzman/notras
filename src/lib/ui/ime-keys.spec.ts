import { describe, expect, it } from "vitest";

import { isImeKey } from "./ime-keys";

describe("ime keys", () => {
  it("should claim a native key typed while composing", () => {
    expect(
      isImeKey(new KeyboardEvent("keydown", { isComposing: true, key: "a" }))
    ).toBeTruthy();
  });

  it("should leave a native key outside a composition to the field", () => {
    expect(isImeKey(new KeyboardEvent("keydown", { key: "a" }))).toBeFalsy();
  });
});
