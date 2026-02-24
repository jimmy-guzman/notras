import { formatDate, formatDateTime } from "./format";

describe("formatDate", () => {
  it("should format a date as 'mon d, yyyy'", () => {
    expect(formatDate(new Date(2025, 0, 1))).toBe("jan 1, 2025");
  });

  it("should use short month names", () => {
    expect(formatDate(new Date(2025, 11, 25))).toBe("dec 25, 2025");
  });

  it("should not zero-pad the day", () => {
    expect(formatDate(new Date(2025, 5, 3))).toBe("jun 3, 2025");
  });
});

describe("formatDateTime", () => {
  it("should format a date with time", () => {
    expect(formatDateTime(new Date(2025, 5, 15, 14, 30))).toBe(
      "jun 15, 2:30 pm",
    );
  });

  it("should format morning times with am", () => {
    expect(formatDateTime(new Date(2025, 0, 1, 9, 0))).toBe("jan 1, 9:00 am");
  });

  it("should format midnight as 12:00 am", () => {
    expect(formatDateTime(new Date(2025, 5, 15, 0, 0))).toBe(
      "jun 15, 12:00 am",
    );
  });

  it("should format noon as 12:00 pm", () => {
    expect(formatDateTime(new Date(2025, 5, 15, 12, 0))).toBe(
      "jun 15, 12:00 pm",
    );
  });
});
