import {
  REMINDER_PRESET_KEYS,
  REMINDER_PRESETS,
  resolvePreset,
} from "./reminder-presets";

describe("REMINDER_PRESETS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should have 8 presets", () => {
    expect(REMINDER_PRESETS).toHaveLength(8);
  });

  it("should have unique keys", () => {
    const keys = REMINDER_PRESETS.map((p) => p.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("should export keys matching the presets", () => {
    expect(REMINDER_PRESET_KEYS).toStrictEqual(
      REMINDER_PRESETS.map((p) => p.key),
    );
  });
});

describe("resolvePreset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve 'in-5-minutes' to 5 minutes from now", () => {
    const result = resolvePreset("in-5-minutes");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 14, 35, 0));
  });

  it("should resolve 'in-30-minutes' to 30 minutes from now", () => {
    const result = resolvePreset("in-30-minutes");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 15, 0, 0));
  });

  it("should resolve 'in-1-hour' to 1 hour from now", () => {
    const result = resolvePreset("in-1-hour");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 15, 30, 0));
  });

  it("should resolve 'in-3-hours' to 3 hours from now", () => {
    const result = resolvePreset("in-3-hours");

    expect(result).toStrictEqual(new Date(2025, 5, 15, 17, 30, 0));
  });

  it("should resolve 'tomorrow-morning' to 9:00 am the next day", () => {
    const result = resolvePreset("tomorrow-morning");

    expect(result).toStrictEqual(new Date(2025, 5, 16, 9, 0, 0));
  });

  it("should resolve 'tomorrow-evening' to 6:00 pm the next day", () => {
    const result = resolvePreset("tomorrow-evening");

    expect(result).toStrictEqual(new Date(2025, 5, 16, 18, 0, 0));
  });

  it("should resolve 'in-3-days' to 9:00 am in 3 days", () => {
    const result = resolvePreset("in-3-days");

    expect(result).toStrictEqual(new Date(2025, 5, 18, 9, 0, 0));
  });

  it("should resolve 'next-week' to 9:00 am in 7 days", () => {
    const result = resolvePreset("next-week");

    expect(result).toStrictEqual(new Date(2025, 5, 22, 9, 0, 0));
  });

  it("should throw for an unknown preset", () => {
    expect(() => resolvePreset("invalid" as "in-1-hour")).toThrow(
      "unknown reminder preset: invalid",
    );
  });
});
