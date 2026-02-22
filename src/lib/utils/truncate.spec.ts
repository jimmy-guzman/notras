import { truncate } from "./truncate";

describe("truncate", () => {
  it("should return the original string when it is shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should return the original string when it is exactly maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("should truncate and append ellipsis when the string exceeds maxLength", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("should handle an empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("should handle maxLength of zero", () => {
    expect(truncate("hello", 0)).toBe("...");
  });
});
