import { addMinutes, startOfToday, startOfWeek, subDays } from "date-fns";

import { groupAndSortNotes } from "./group-notes";

const baseNote = {
  content: "test",
  pinnedAt: null,
};

describe("groupAndSortNotes", () => {
  it("should group a note created today into 'today'", () => {
    const note = {
      ...baseNote,
      createdAt: addMinutes(startOfToday(), 60),
      id: "today",
    };

    const result = groupAndSortNotes([note]);

    expect(result).toStrictEqual([
      {
        group: "today",
        label: "Today",
        notes: [note],
      },
    ]);
  });

  it("should group a note created earlier this week into 'thisWeek'", () => {
    const note = {
      ...baseNote,
      createdAt: addMinutes(startOfWeek(new Date(), { weekStartsOn: 1 }), 60),
      id: "this-week",
    };

    const result = groupAndSortNotes([note]);

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

    const result = groupAndSortNotes([note]);

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

    const thisWeek = {
      ...baseNote,
      createdAt: addMinutes(startOfWeek(new Date(), { weekStartsOn: 1 }), 60),
      id: "this-week",
    };

    const earlier = {
      ...baseNote,
      createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1),
      id: "earlier",
    };

    const result = groupAndSortNotes([today, thisWeek, earlier]);

    expect(
      result.map((g) => {
        return g.group;
      }),
    ).toStrictEqual(["today", "thisWeek", "earlier"]);
  });

  it("should omit empty groups", () => {
    const note = {
      ...baseNote,
      createdAt: subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 3),
      id: "earlier",
    };

    const result = groupAndSortNotes([note]);

    expect(
      result.map((g) => {
        return g.group;
      }),
    ).toStrictEqual(["earlier"]);
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

    const result = groupAndSortNotes([
      unpinnedOlder,
      pinnedNote,
      unpinnedNewer,
    ]);

    const todayGroup = result.find((g) => {
      return g.group === "today";
    });

    expect(
      todayGroup?.notes.map((n) => {
        return n.id;
      }),
    ).toStrictEqual([
      "pinned", // pinned first
      "newer", // then newer
      "older", // then older
    ]);
  });
});
