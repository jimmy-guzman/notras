import {
  addDays,
  addMinutes,
  setHours,
  setMinutes,
  startOfToday,
  startOfWeek,
  subDays,
} from "date-fns";

import { groupNotesByTime } from "./group-notes-by-time";

const baseNote = {
  content: "test",
  kind: null,
  metadata: null,
  pinnedAt: null,
};

describe("groupNotesByTime", () => {
  const MOCKED_DATE = new Date("2025-05-06T12:00:00Z");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCKED_DATE);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should group a note created today into 'today'", () => {
    const note = {
      ...baseNote,
      createdAt: addMinutes(startOfToday(), 60),
      id: "today",
    };

    const result = groupNotesByTime([note]);

    expect(result).toStrictEqual([
      {
        group: "today",
        label: "Today",
        notes: [note],
      },
    ]);
  });

  it("should group a note created yesterday into 'yesterday'", () => {
    const yesterday = subDays(startOfToday(), 1);
    const note = {
      ...baseNote,
      createdAt: setHours(setMinutes(yesterday, 30), 10), // 10:30 AM yesterday
      id: "yesterday",
    };

    const result = groupNotesByTime([note]);

    expect(result).toStrictEqual([
      {
        group: "yesterday",
        label: "Yesterday",
        notes: [note],
      },
    ]);
  });

  it("should group a note created earlier this week into 'thisWeek'", () => {
    const note = {
      ...baseNote,
      createdAt: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 2), // safely mid-week
      id: "this-week",
    };

    const result = groupNotesByTime([note]);

    expect(result).toStrictEqual([
      {
        group: "thisWeek",
        label: "This Week",
        notes: [note],
      },
    ]);
  });

  it("should group a note created more than a week ago into 'earlier'", () => {
    const note = {
      ...baseNote,
      createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1),
      id: "earlier",
    };

    const result = groupNotesByTime([note]);

    expect(result).toStrictEqual([
      {
        group: "earlier",
        label: "Earlier",
        notes: [note],
      },
    ]);
  });

  it("should return groups in the correct order", () => {
    const today = {
      ...baseNote,
      createdAt: new Date(),
      id: "today",
    };

    const yesterday = {
      ...baseNote,
      createdAt: setHours(setMinutes(subDays(startOfToday(), 1), 15), 9),
      id: "yesterday",
    };

    const thisWeek = {
      ...baseNote,
      createdAt: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 2), // Wednesday
      id: "this-week",
    };

    const earlier = {
      ...baseNote,
      createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1),
      id: "earlier",
    };

    const result = groupNotesByTime([today, yesterday, thisWeek, earlier]);

    expect(result.map((g) => g.group)).toStrictEqual([
      "today",
      "yesterday",
      "thisWeek",
      "earlier",
    ]);
  });

  it("should omit empty groups", () => {
    const note = {
      ...baseNote,
      createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 3),
      id: "earlier",
    };

    const result = groupNotesByTime([note]);

    expect(result.map((g) => g.group)).toStrictEqual(["earlier"]);
  });

  it("should sort pinned notes to the top within a group", () => {
    const now = new Date();

    const pinnedNote = {
      ...baseNote,
      createdAt: addMinutes(now, -10),
      id: "pinned",
      pinnedAt: now,
    };

    const unpinnedNewer = {
      ...baseNote,
      createdAt: addMinutes(now, -5),
      id: "newer",
      pinnedAt: null,
    };

    const unpinnedOlder = {
      ...baseNote,
      createdAt: addMinutes(now, -20),
      id: "older",
      pinnedAt: null,
    };

    const result = groupNotesByTime([unpinnedOlder, pinnedNote, unpinnedNewer]);

    const todayGroup = result.find((g) => g.group === "today");

    expect(todayGroup?.notes.map((n) => n.id)).toStrictEqual([
      "pinned",
      "newer",
      "older",
    ]);
  });
});
