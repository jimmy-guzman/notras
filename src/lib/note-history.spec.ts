import { describe, expect, it } from "vitest";

import type { NoteMeta } from "@/core/notes";

import { notesByDay } from "./note-history";

function note(path: string, createdAt: Date, updatedAt: Date): NoteMeta {
  return {
    createdAt,
    folder: "",
    path,
    pinned: false,
    snippet: null,
    tags: [],
    title: path,
    updatedAt,
  };
}

describe("note history", () => {
  it("should group the notes by the day each was last saved, the latest first", () => {
    const notes = [
      note("older.md", new Date(0), new Date(2026, 10, 15, 23, 59)),
      note("week-start.md", new Date(0), new Date(2026, 10, 16, 0, 0)),
      note("week-end.md", new Date(0), new Date(2026, 10, 21, 23, 59)),
      note("yesterday.md", new Date(0), new Date(2026, 10, 22, 0, 0)),
      note("today.md", new Date(0), new Date(2026, 10, 23, 0, 0)),
    ];

    const days = (now: Date) =>
      [...notesByDay(notes, now.getTime())].map(([day, saved]) => [
        day,
        saved.map(({ path }) => path),
      ]);

    expect(days(new Date(2026, 10, 23, 10, 0))).toStrictEqual([
      ["today", ["today.md"]],
      ["yesterday", ["yesterday.md"]],
      ["previous 7 days", ["week-end.md", "week-start.md"]],
      ["older", ["older.md"]],
    ]);
    expect(days(new Date(2026, 10, 24, 0, 0))).toStrictEqual([
      ["yesterday", ["today.md"]],
      ["previous 7 days", ["yesterday.md", "week-end.md"]],
      ["older", ["week-start.md", "older.md"]],
    ]);
  });

  it("should use the created time of a file that was saved before it arrived", () => {
    const dropped = note(
      "dropped.md",
      new Date(2026, 10, 23, 9, 0),
      new Date(2026, 9, 1, 9, 0)
    );

    expect([
      ...notesByDay([dropped], new Date(2026, 10, 23, 10, 0).getTime()).keys(),
    ]).toStrictEqual(["today"]);
  });

  it("should count a time ahead of the clock as today", () => {
    const ahead = note("ahead.md", new Date(0), new Date(2026, 10, 30, 0, 0));

    expect([
      ...notesByDay([ahead], new Date(2026, 10, 23, 10, 0).getTime()).keys(),
    ]).toStrictEqual(["today"]);
  });
});
