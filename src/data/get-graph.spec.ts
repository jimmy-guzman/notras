import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";

import { getGraph } from "./get-graph";

describe("graph dates", () => {
  afterEach(clearMocks);

  it("should convert dates in a note and its incoming and outgoing mentions", async () => {
    mockIPC((command, args) => {
      expect(command).toBe("read_graph");
      expect(args).toStrictEqual({ target: { kind: "note", path: "a.md" } });

      return {
        mentionsError: null,
        picture: {
          graph: {
            dangling: [],
            hubs: [],
            incoming: [
              {
                lines: [{ at: 0, context: "A", line: 1 }],
                note: {
                  createdAt: 0,
                  folder: "",
                  path: "b.md",
                  pinned: false,
                  snippet: null,
                  tags: [],
                  title: "B",
                  updatedAt: 1234,
                },
              },
            ],
            outgoing: [
              {
                lines: [{ at: 2, context: "C", line: 3 }],
                note: {
                  createdAt: 1000,
                  folder: "",
                  path: "c.md",
                  pinned: false,
                  snippet: null,
                  tags: [],
                  title: "C",
                  updatedAt: 2345,
                },
              },
            ],
          },
          kind: "note",
          note: {
            createdAt: 0,
            folder: "",
            path: "a.md",
            pinned: false,
            snippet: null,
            tags: [],
            title: "A",
            updatedAt: 3456,
          },
        },
      };
    });

    await expect(
      getGraph({ kind: "note", path: "a.md" })
    ).resolves.toMatchObject({
      mentionsError: null,
      picture: {
        incoming: [
          {
            lines: [{ at: 0, context: "A", line: 1 }],
            note: { createdAt: new Date(0), updatedAt: new Date(1234) },
          },
        ],
        kind: "note",
        note: { createdAt: new Date(0), updatedAt: new Date(3456) },
        outgoing: [
          {
            lines: [{ at: 2, context: "C", line: 3 }],
            note: { createdAt: new Date(1000), updatedAt: new Date(2345) },
          },
        ],
      },
    });
  });

  it("should convert hub member dates while keeping hubs ahead of sorted notes", async () => {
    mockIPC(() => ({
      mentionsError: null,
      picture: {
        hub: { count: 3, hub: { kind: "tag", tag: "work" } },
        kind: "hub",
        members: [
          {
            kind: "note",
            note: {
              createdAt: 0,
              folder: "",
              path: "z.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "Z",
              updatedAt: 1234,
            },
          },
          {
            kind: "hub",
            pill: { count: 1, hub: { folder: "work", kind: "folder" } },
          },
          {
            kind: "note",
            note: {
              createdAt: 1000,
              folder: "",
              path: "a.md",
              pinned: false,
              snippet: null,
              tags: [],
              title: "A",
              updatedAt: 2345,
            },
          },
        ],
      },
    }));

    await expect(
      getGraph({ hub: { kind: "tag", tag: "work" }, kind: "hub" })
    ).resolves.toMatchObject({
      picture: {
        kind: "hub",
        members: [
          {
            kind: "hub",
            pill: { count: 1, hub: { folder: "work", kind: "folder" } },
          },
          {
            kind: "note",
            note: {
              createdAt: new Date(1000),
              path: "a.md",
              updatedAt: new Date(2345),
            },
          },
          {
            kind: "note",
            note: {
              createdAt: new Date(0),
              path: "z.md",
              updatedAt: new Date(1234),
            },
          },
        ],
      },
    });
  });

  it("should preserve an absent graph and its native failure", async () => {
    mockIPC(() => ({
      mentionsError: { kind: "failed", message: "The index is unavailable" },
      picture: null,
    }));
    await expect(
      getGraph({ kind: "note", path: "a.md" })
    ).resolves.toStrictEqual({
      mentionsError: { kind: "failed", message: "The index is unavailable" },
      picture: undefined,
    });
  });
});
