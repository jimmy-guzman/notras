import { getStartDateForFilter } from "./note-filters";

describe("getStartDateForFilter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return start of today for 'today'", () => {
    const result = getStartDateForFilter("today");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 0, 0, 0));
  });

  it("should return start of yesterday for 'yesterday'", () => {
    const result = getStartDateForFilter("yesterday");

    expect(result).toStrictEqual(new Date(2025, 5, 14, 0, 0, 0));
  });

  it("should return start of the week for 'week'", () => {
    const result = getStartDateForFilter("week");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 0, 0, 0));
  });

  it("should return start of the month for 'month'", () => {
    const result = getStartDateForFilter("month");

    expect(result).toStrictEqual(new Date(2025, 5, 1, 0, 0, 0));
  });

  it("should return start of the year for 'year'", () => {
    const result = getStartDateForFilter("year");

    expect(result).toStrictEqual(new Date(2025, 0, 1, 0, 0, 0));
  });
});
