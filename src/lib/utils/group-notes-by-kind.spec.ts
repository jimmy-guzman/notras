import { addMinutes } from "date-fns";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";

import { groupNotesByKind } from "./group-notes-by-kind";

const now = new Date();

describe("groupNotesByKind", () => {
  it("should group notes by kind", () => {
    const note1 = {
      content: "note 1",
      createdAt: addMinutes(now, -10),
      id: "1",
      kind: "thought" as const,
      pinnedAt: null,
    };

    const note2 = {
      content: "note 2",
      createdAt: addMinutes(now, -20),
      id: "2",
      kind: "question" as const,
      pinnedAt: null,
    };

    const note3 = {
      content: "note 3",
      createdAt: addMinutes(now, -30),
      id: "3",
      kind: "todo" as const,
      pinnedAt: null,
    };

    const result = groupNotesByKind([note1, note2, note3]);

    expect(result).toStrictEqual([
      { group: "thought", label: KIND_LABELS.thought, notes: [note1] },
      { group: "todo", label: KIND_LABELS.todo, notes: [note3] },
      { group: "question", label: KIND_LABELS.question, notes: [note2] },
    ]);
  });

  it("should sort pinned notes first, then by createdAt desc", () => {
    const pinned = {
      content: "pinned",
      createdAt: addMinutes(now, -20),
      id: "1",
      kind: "memory" as Kind,
      pinnedAt: now,
    };

    const newer = {
      content: "newer",
      createdAt: addMinutes(now, -10),
      id: "2",
      kind: "memory" as Kind,
      pinnedAt: null,
    };

    const older = {
      content: "older",
      createdAt: addMinutes(now, -30),
      id: "3",
      kind: "memory" as Kind,
      pinnedAt: null,
    };

    const result = groupNotesByKind([older, pinned, newer]);

    expect(result).toStrictEqual([
      {
        group: "memory",
        label: KIND_LABELS.memory,
        notes: [pinned, newer, older],
      },
    ]);
  });

  it("should exclude kinds with no notes", () => {
    const note = {
      content: "only dream",
      createdAt: addMinutes(now, -10),
      id: "1",
      kind: "dream" as Kind,
      pinnedAt: null,
    };

    const result = groupNotesByKind([note]);

    expect(result.map((g) => g.group)).toStrictEqual(["dream"]);
  });

  it("should fallback to 'thought' if kind is missing", () => {
    const note = {
      content: "missing kind",
      createdAt: addMinutes(now, -5),
      id: "1",
      kind: null,
      pinnedAt: null,
    };

    const result = groupNotesByKind([note]);

    expect(result).toStrictEqual([
      {
        group: "thought",
        label: KIND_LABELS.thought,
        notes: [note],
      },
    ]);
  });
});
