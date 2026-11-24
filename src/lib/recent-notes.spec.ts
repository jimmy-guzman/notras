import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { Toaster } from "@/components/ui/toast";
import type { NoteMeta } from "@/core/notes";

import {
  forgetNote,
  readVisits,
  recentNotes,
  rememberNote,
  renameRecentNote,
} from "./recent-notes";

function note(
  path: string,
  createdAt: Date,
  updatedAt: Date,
  pinned = false
): NoteMeta {
  return {
    createdAt,
    folder: "",
    path,
    pinned,
    snippet: null,
    tags: [],
    title: path,
    updatedAt,
  };
}

describe("recent notes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should report a storage failure and preserve the last saved history", async () => {
    rememberNote("/notes", "kept.md");
    render(createElement(Toaster));

    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });

    onTestFinished(() => {
      write.mockRestore();
    });
    expect(() => {
      rememberNote("/notes", "new.md");
    }).not.toThrow();
    expect([...readVisits("/notes").keys()]).toStrictEqual(["kept.md"]);
    expect(
      await screen.findByText("could not update recent notes")
    ).toBeInTheDocument();
    expect(screen.getByText("Storage is full")).toBeInTheDocument();
  });

  it.each([false, true])(
    "should return empty history after a read failure when logging fails: %s",
    async (loggingFails) => {
      const logged: unknown[] = [];
      mockIPC((command, args) => {
        logged.push({ args, command });

        if (loggingFails) {
          throw new Error("Log is unavailable");
        }
      });

      const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
        throw new DOMException("Storage access is denied", "SecurityError");
      });

      onTestFinished(() => {
        read.mockRestore();
        clearMocks();
      });

      expect([...readVisits("/notes").keys()]).toStrictEqual([]);
      await waitFor(() => {
        expect(logged).toMatchObject([
          {
            args: {
              message: "could not read recent notes: Storage access is denied",
            },
            command: "plugin:log|log",
          },
        ]);
      });
    }
  );

  it.each(["null", "bad json", '["a.md"]', '{"a.md":"yesterday"}'])(
    "should discard invalid history %s",
    (raw) => {
      localStorage.setItem("recent-notes:/notes", raw);
      expect([...readVisits("/notes").keys()]).toStrictEqual([]);
    }
  );

  it("should put the latest of a visit, a save and a creation first, pinned or not, then order by path", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });

    vi.setSystemTime(new Date(2026, 10, 23, 10, 0));
    rememberNote("/notes", "visited.md");
    rememberNote("/notes", "missing.md");
    expect(
      recentNotes(
        [
          note("pinned-old.md", new Date(0), new Date(0), true),
          note("a-old.md", new Date(0), new Date(0)),
          note("visited.md", new Date(0), new Date(0)),
          note("created-later.md", new Date(2026, 10, 23, 10, 30), new Date(0)),
          note("saved-later.md", new Date(0), new Date(2026, 10, 23, 11, 0)),
        ],
        readVisits("/notes")
      ).map(({ path }) => path)
    ).toStrictEqual([
      "saved-later.md",
      "created-later.md",
      "visited.md",
      "a-old.md",
      "pinned-old.md",
    ]);
  });

  it("should stamp a visit with the clock after an earlier visit was stamped ahead of it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(new Date(2027, 10, 23, 10, 0));
    rememberNote("/notes", "ahead.md");
    vi.setSystemTime(new Date(2026, 10, 23, 10, 0));
    rememberNote("/notes", "now.md");
    expect([...readVisits("/notes").keys()]).toStrictEqual([
      "now.md",
      "ahead.md",
    ]);
    expect(readVisits("/notes").get("now.md")).toBe(
      new Date(2026, 10, 23, 10, 0).getTime()
    );
  });

  it("should keep the order of two visits inside one tick of the clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.setSystemTime(new Date(2026, 10, 23, 10, 0));
    rememberNote("/notes", "first.md");
    rememberNote("/notes", "second.md");
    expect([...readVisits("/notes").keys()]).toStrictEqual([
      "second.md",
      "first.md",
    ]);
  });

  it("should carry renames and moves without a visit and remove deleted history only from its library", () => {
    rememberNote("/notes", "a.md");
    rememberNote("/notes", "b.md");
    rememberNote("/other", "a.md");
    renameRecentNote("/notes", "a.md", "renamed.md");
    renameRecentNote("/notes", "renamed.md", "folder/renamed.md");
    renameRecentNote("/notes", "unvisited.md", "elsewhere.md");
    expect([...readVisits("/notes").keys()]).toStrictEqual([
      "b.md",
      "folder/renamed.md",
    ]);
    expect([...readVisits("/other").keys()]).toStrictEqual(["a.md"]);
    forgetNote("/notes", "b.md");
    expect([...readVisits("/notes").keys()]).toStrictEqual([
      "folder/renamed.md",
    ]);
    expect(localStorage.getItem("recent-notes:/notes")).toMatch(
      /^\{"folder\/renamed\.md":\d+\}$/v
    );
  });
});
