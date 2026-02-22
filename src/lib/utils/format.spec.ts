import { formatDate } from "./format";

describe("formatDate", () => {
  it("should format a date as 'Mon DD, YYYY'", () => {
    expect(formatDate(new Date(2025, 0, 1))).toBe("Jan 1, 2025");
  });

  it("should use short month names", () => {
    expect(formatDate(new Date(2025, 11, 25))).toBe("Dec 25, 2025");
  });

  it("should not zero-pad the day", () => {
    expect(formatDate(new Date(2025, 5, 3))).toBe("Jun 3, 2025");
  });
});
